const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const LINK_SECONDS = 300;

function makeClient(endpoint) {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: endpoint || undefined,
    forcePathStyle: true
  });
}

let fileClient = null;
let linkClient = null;

function bucket() {
  const name = (process.env.REPORTS_BUCKET || '').trim();
  if (!name) throw new Error('REPORTS_BUCKET is not set.');
  return name;
}

async function saveFile(key, content, contentType) {
  if (!fileClient) fileClient = makeClient(process.env.S3_ENDPOINT);
  await fileClient.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: content, ContentType: contentType }));
}

async function downloadLink(key, fileName) {
  if (!linkClient) linkClient = makeClient(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT);
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName}"`
  });
  return getSignedUrl(linkClient, command, { expiresIn: LINK_SECONDS });
}

module.exports = { saveFile, downloadLink };
