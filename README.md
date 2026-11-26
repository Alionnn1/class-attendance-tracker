Class Attendance Tracker

A cloud-based web app for taking class attendance with a short session code. The instructor opens a session, students enter the code during class, and the system records attendance, flags students close to the absence limit, emails warnings and exports reports.

Team 23 – Introduction to Cloud Computing (25CSCI37H), The British University in Egypt.

Team
Member	Service	Branch
Zeyad Ashraf	Student Service	ZiadAshraffBRANCH
Ziad Sameh	Instructor and Session Service	instructor/session-service
Pola Emad	Course and Reports Service	course/course-reports-service
Features
Students: check in with the session code, see attendance and absences left per course, submit an excuse for a missed session.
Instructors: open and close sessions (absentees are marked automatically), review excuses, see flagged students, export reports.
Administrators: manage students, instructors and courses, including each course's attendance policy. There is no self sign-up.
Warnings: first warning, second warning and barred from the unseen exam, sent by email through the Brevo API without duplicates.
Tech stack
Frontend: HTML, CSS and JavaScript (fetch API), hosted as static files in S3
Backend: Node.js and Express, one app per service, running on AWS Lambda behind API Gateway
Database: Neon Postgres (@neondatabase/serverless)
Cloud: AWS services (Lambda, API Gateway, S3, IAM, CloudWatch) emulated with Floci
External API: Brevo transactional email
Project structure
backend/
  student-service/             Check-in, attendance summary, excuse requests, student accounts
  instructor-session-service/  Sessions, excuse review, instructor accounts
  course-reports-service/      Courses, absence flagging, warnings, reports
  shared/                      Auth, database and shared helpers
database/                      Schema, setup script and seed data
frontend/                      Admin, instructor and student pages
infrastructure/                Floci docker-compose, deploy script, IAM policies
docs/                          Final report
Getting started

Requirements: Node.js 20 or newer, and Docker (for Floci).

Copy .env.example to .env and fill in the values (DATABASE_URL, INTERNAL_API_KEY, BREVO_API_KEY, and so on).
Install dependencies:
npm run install:all
Create the database tables and seed data:
npm run db:setup
Run everything locally (three services and the website on port 8080):
npm run dev
Deploy to Floci
docker compose -f infrastructure/docker-compose.yml up -d
npm run deploy

The website is then served from the S3 bucket at http://localhost:4566/attendance-web/.

Run npm run check to test the end-to-end scenario.

Documentation
Final report: docs/Final_Report.docx
Demo video: Google Drive
