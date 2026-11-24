#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PATH="$PATH:$HOME/.docker/bin"
export MSYS_NO_PATHCONV=1

REGION=us-east-1
ACCOUNT=000000000000
FLOCI=http://localhost:4566
WEB_BUCKET=attendance-web
REPORTS_BUCKET=attendance-reports
RUNTIME=nodejs24.x
BUILD=infrastructure/build
DEPLOY=/deploy

aws() {
  docker exec -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test -e AWS_DEFAULT_REGION=$REGION \
    -e AWS_PAGER= floci aws --endpoint-url http://localhost:4566 "$@"
}

setting() {
  grep -E "^$1=" .env 2>/dev/null | head -n 1 | cut -d= -f2- | tr -d '\r' || true
}

step() { printf '\n== %s\n' "$1"; }

step "Checking Floci and the settings"
if ! docker exec floci true 2>/dev/null; then
  echo "Floci is not running. Start it first:"
  echo "  docker compose -f infrastructure/docker-compose.yml up -d"
  exit 1
fi
DATABASE_URL="$(setting DATABASE_URL)"
INTERNAL_API_KEY="$(setting INTERNAL_API_KEY)"
if [ -z "$DATABASE_URL" ] || [ ${#INTERNAL_API_KEY} -lt 16 ]; then
  echo "Fill in DATABASE_URL and INTERNAL_API_KEY in .env first (see .env.example)."
  exit 1
fi
aws sts get-caller-identity --query Account --output text

step "S3 buckets"
for bucket in $WEB_BUCKET $REPORTS_BUCKET; do
  aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1 || aws s3 mb "s3://$bucket"
done
mkdir -p "$BUILD"
cp infrastructure/iam/*.json "$BUILD/"
aws s3api put-public-access-block --bucket $WEB_BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket $WEB_BUCKET --policy "file://$DEPLOY/website-bucket-policy.json"

step "IAM roles and policies"
ensure_policy() {
  aws iam get-policy --policy-arn "arn:aws:iam::$ACCOUNT:policy/$1" >/dev/null 2>&1 ||
    aws iam create-policy --policy-name "$1" --policy-document "file://$DEPLOY/$2" --query Policy.Arn --output text
}
ensure_policy attendance-logs logs-policy.json
ensure_policy attendance-reports-bucket reports-bucket-policy.json

for service in student session course; do
  role="attendance-$service-role"
  aws iam get-role --role-name "$role" >/dev/null 2>&1 ||
    aws iam create-role --role-name "$role" --assume-role-policy-document "file://$DEPLOY/trust-policy.json" --query Role.Arn --output text
  aws iam attach-role-policy --role-name "$role" --policy-arn "arn:aws:iam::$ACCOUNT:policy/attendance-logs"
done
aws iam attach-role-policy --role-name attendance-course-role --policy-arn "arn:aws:iam::$ACCOUNT:policy/attendance-reports-bucket"

step "Packaging the services"
node backend/sync-shared.js
folder_of() {
  case "$1" in
    student) echo backend/student-service ;;
    session) echo backend/instructor-session-service ;;
    course) echo backend/course-reports-service ;;
  esac
}
for service in student session course; do
  folder="$(folder_of $service)"
  [ -d "$folder/node_modules" ] || npm install --prefix "$folder" --omit=dev --silent
  rm -f "$BUILD/$service.zip"
  docker exec -w "/project/$folder" floci python3 -m zipfile -c "$DEPLOY/$service.zip" \
    app.js lambda.js routes.js package.json controllers services shared node_modules
  echo "$service.zip $(du -h "$BUILD/$service.zip" | cut -f1)"
done

step "Lambda functions"
for service in student session course; do
  name="attendance-$service"
  aws logs create-log-group --log-group-name "/aws/lambda/$name" 2>/dev/null || true
  aws logs put-retention-policy --log-group-name "/aws/lambda/$name" --retention-in-days 14
  if aws lambda get-function --function-name "$name" >/dev/null 2>&1; then
    aws lambda update-function-code --function-name "$name" --zip-file "fileb://$DEPLOY/$service.zip" --query LastUpdateStatus --output text
    aws lambda wait function-updated-v2 --function-name "$name"
  else
    aws lambda create-function --function-name "$name" --runtime $RUNTIME --handler lambda.handler \
      --role "arn:aws:iam::$ACCOUNT:role/attendance-$service-role" \
      --zip-file "fileb://$DEPLOY/$service.zip" --timeout 20 --memory-size 256 \
      --query State --output text
    aws lambda wait function-active-v2 --function-name "$name"
  fi
done

step "API Gateway"
routes_of() {
  case "$1" in
    student) printf '%s\n' \
      "GET /health" "POST /auth/login" "POST /auth/logout" \
      "POST /attendance/check-in" "GET /students/me/attendance-summary" "GET /students/me/attendance" \
      "GET /students/me/excuses" "POST /excuses" \
      "GET /students" "POST /students" "PATCH /students/{id}" "DELETE /students/{id}" \
      "POST /attendance/absences" "PATCH /excuses/{id}/status" "GET /courses/{id}/attendance-totals" ;;
    session) printf '%s\n' \
      "GET /health" "GET /instructors/me/courses" "POST /sessions" "GET /sessions/open" \
      "GET /sessions/{id}" "PATCH /sessions/{id}/close" "GET /courses/{id}/excuses" "PATCH /excuses/{id}/review" \
      "GET /instructors" "POST /instructors" "PATCH /instructors/{id}" "DELETE /instructors/{id}" ;;
    course) printf '%s\n' \
      "GET /health" "GET /courses" "POST /courses" "GET /courses/{id}" "PATCH /courses/{id}" "DELETE /courses/{id}" \
      "GET /courses/{id}/flags" "POST /courses/{id}/warnings" \
      "POST /reports" "GET /reports" "GET /reports/{id}/download" ;;
  esac
}

api_url() { echo "http://$1.execute-api.localhost.floci.io:4566"; }

for service in student session course; do
  name="attendance-$service"
  api_id="$(aws apigatewayv2 get-apis --query "Items[?Name=='$name-api'].ApiId | [0]" --output text)"
  if [ -z "$api_id" ] || [ "$api_id" = "None" ]; then
    api_id="$(aws apigatewayv2 create-api --name "$name-api" --protocol-type HTTP --query ApiId --output text)"
    integration_id="$(aws apigatewayv2 create-integration --api-id "$api_id" \
      --integration-type AWS_PROXY --payload-format-version 2.0 \
      --integration-uri "arn:aws:lambda:$REGION:$ACCOUNT:function:$name" \
      --query IntegrationId --output text)"
    routes="$(routes_of $service)"
    options="$(echo "$routes" | sed 's/^[A-Z]* /OPTIONS /' | sort -u)"
    printf '%s\n%s\n' "$routes" "$options" | while read -r route; do
      aws apigatewayv2 create-route --api-id "$api_id" --route-key "$route" \
        --target "integrations/$integration_id" --query RouteKey --output text >/dev/null
    done
    aws apigatewayv2 create-stage --api-id "$api_id" --stage-name '$default' --auto-deploy >/dev/null
    aws lambda add-permission --function-name "$name" --statement-id apigw-invoke \
      --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT:$api_id/*" >/dev/null
  fi
  echo "$name-api  $(api_url "$api_id")"
  case $service in
    student) STUDENT_API="$(api_url "$api_id")" ;;
    session) SESSION_API="$(api_url "$api_id")" ;;
    course) COURSE_API="$(api_url "$api_id")" ;;
  esac
done

step "Function settings"
WEBSITE_ORIGIN="$FLOCI"
node infrastructure/lambda-env.js "$BUILD" \
  "DATABASE_URL=$DATABASE_URL" \
  "INTERNAL_API_KEY=$INTERNAL_API_KEY" \
  "TOKEN_TTL_HOURS=$(setting TOKEN_TTL_HOURS)" \
  "CORS_ORIGINS=$WEBSITE_ORIGIN" \
  "STUDENT_SERVICE_URL=$STUDENT_API" \
  "SESSION_SERVICE_URL=$SESSION_API" \
  "COURSE_SERVICE_URL=$COURSE_API" \
  "BREVO_API_KEY=$(setting BREVO_API_KEY)" \
  "EMAIL_SENDER=$(setting EMAIL_SENDER)" \
  "REPORTS_BUCKET=$REPORTS_BUCKET" \
  "S3_PUBLIC_ENDPOINT=$FLOCI"
for service in student session course; do
  aws lambda update-function-configuration --function-name "attendance-$service" --runtime $RUNTIME \
    --environment "file://$DEPLOY/env-$service.json" --query LastUpdateStatus --output text
  aws lambda wait function-updated-v2 --function-name "attendance-$service"
done

step "Website"
rm -rf "$BUILD/website"
mkdir -p "$BUILD/website"
cp -R frontend/*.html frontend/css frontend/js "$BUILD/website/"
cat > "$BUILD/website/js/config.js" <<EOF
export const CONFIG = {
  services: {
    student: '$STUDENT_API',
    session: '$SESSION_API',
    course: '$COURSE_API'
  }
};
EOF
aws s3 sync "$DEPLOY/website" "s3://$WEB_BUCKET" --delete --exclude '*.DS_Store' >/dev/null
aws s3 cp "$DEPLOY/website/css" "s3://$WEB_BUCKET/css" --recursive --content-type text/css >/dev/null
aws s3 cp "$DEPLOY/website/js" "s3://$WEB_BUCKET/js" --recursive --content-type text/javascript >/dev/null
aws s3 ls "s3://$WEB_BUCKET" --recursive | wc -l | xargs echo "website files:"

step "Done"
echo "Website:   $FLOCI/$WEB_BUCKET/index.html"
echo "APIs:      $STUDENT_API  $SESSION_API  $COURSE_API"
echo "Dashboard: $FLOCI/_floci/ui"
echo "Logs:      docker exec floci aws --endpoint-url http://localhost:4566 logs tail /aws/lambda/attendance-student --since 15m"
