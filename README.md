# CTI CRM Platform

Enterprise-grade multi-tenant CRM, Ticket Management, Calling & Automation platform built for call center operations.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | Redux Toolkit, React Query |
| Backend | FastAPI (Python 3.10), SQLAlchemy (async) |
| Database | MySQL 8.0 |
| Queue | Redis + Celery (optional) |
| Storage | MinIO / AWS S3 |
| Deployment | Docker + Docker Compose + Nginx |

---

## Project Structure

```
CTI/
├── backend/                        # FastAPI Python backend
│   ├── app/
│   │   ├── main.py                 # App entry point, router registration
│   │   ├── api/                    # REST API route handlers
│   │   │   ├── auth.py             # Login, register, refresh token, logout
│   │   │   ├── clients.py          # Client management, departments, teams
│   │   │   ├── users.py            # Users, roles, permissions CRUD
│   │   │   ├── tickets.py          # Ticket CRUD, comments, logs, close/reopen
│   │   │   ├── forms.py            # Dynamic form builder CRUD + field management
│   │   │   ├── calls.py            # Campaigns, call logs, uploads, callbacks
│   │   │   ├── alerts.py           # Alert rules, templates, escalation rules
│   │   │   ├── notifications.py    # In-app notifications, mark read
│   │   │   ├── reports.py          # Dashboard stats, ticket/call/agent reports
│   │   │   └── audit.py            # Audit log viewer
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── user.py             # User, Role, Permission, RolePermission, UserPermission
│   │   │   ├── client.py           # Client, Department, Team, TeamMember
│   │   │   ├── ticket.py           # Ticket, TicketComment, TicketLog, TicketAttachment
│   │   │   ├── form.py             # Form, FormField, FormFieldRule, FormVersion
│   │   │   ├── alert.py            # Alert, AlertTemplate, EscalationRule, EscalationLog
│   │   │   ├── call.py             # Campaign, UploadBatch, UploadRecord, CallLog, Callback
│   │   │   ├── notification.py     # Notification
│   │   │   ├── audit.py            # AuditLog
│   │   │   └── session.py          # UserSession (refresh tokens)
│   │   ├── core/
│   │   │   ├── config.py           # Settings via pydantic-settings (.env)
│   │   │   ├── database.py         # Async SQLAlchemy engine + session
│   │   │   ├── security.py         # JWT create/decode, bcrypt password hash
│   │   │   └── seed.py             # Initial permissions + admin user seeder
│   │   ├── middleware/
│   │   │   └── auth.py             # JWT bearer dependency, role guards
│   │   ├── permissions/
│   │   │   └── checker.py          # Dynamic RBAC — role + user level permission check
│   │   ├── websocket/
│   │   │   ├── manager.py          # WebSocket connection manager (per user/client)
│   │   │   └── router.py           # WS endpoint — JWT auth on connect
│   │   ├── workers/
│   │   │   ├── celery_app.py       # Celery app + beat schedule
│   │   │   └── tasks/
│   │   │       ├── alerts.py       # Email/SMS alert tasks, callback reminders
│   │   │       ├── escalations.py  # Escalation checker, SLA breach checker
│   │   │       └── dialer.py       # Push records to VICIdial/dialer
│   │   └── utils/
│   │       └── ticket_number.py    # Auto ticket number generator
│   ├── .env                        # Local environment variables
│   ├── requirements.txt            # Python dependencies
│   └── Dockerfile                  # Backend Docker image
│
├── frontend/                       # React TypeScript frontend
│   ├── src/
│   │   ├── main.tsx                # React entry point, providers setup
│   │   ├── App.tsx                 # Route definitions, protected routes
│   │   ├── index.css               # Tailwind base + custom component classes
│   │   ├── layouts/
│   │   │   ├── AppLayout.tsx       # Sidebar + TopBar shell for authenticated pages
│   │   │   └── AuthLayout.tsx      # Centered card layout for login/register
│   │   ├── components/
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx     # Navigation sidebar with role-based menu items
│   │   │       └── TopBar.tsx      # Search bar, theme toggle, notification bell
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.tsx   # Email + password login
│   │   │   │   └── RegisterPage.tsx# Company self-registration
│   │   │   ├── tickets/
│   │   │   │   ├── TicketsPage.tsx      # Ticket list with filters, status tabs, search
│   │   │   │   ├── TicketNewPage.tsx    # Create ticket + dynamic form fields
│   │   │   │   └── TicketDetailPage.tsx # View ticket, comments, logs, update status
│   │   │   ├── forms/
│   │   │   │   ├── FormsPage.tsx        # Form cards list
│   │   │   │   └── FormBuilderPage.tsx  # Drag-and-drop form builder with live preview
│   │   │   ├── calls/
│   │   │   │   ├── CampaignsPage.tsx    # Campaign cards + CSV/Excel data upload
│   │   │   │   └── CallLogsPage.tsx     # Call log table with recording links
│   │   │   ├── admin/
│   │   │   │   └── ClientsPage.tsx      # Admin client list, activate/deactivate
│   │   │   ├── DashboardPage.tsx        # Charts: weekly trend, status pie, priority bar
│   │   │   ├── UsersPage.tsx            # User list, create user modal
│   │   │   ├── AlertsPage.tsx           # Alert rules + escalation rule builder
│   │   │   ├── ReportsPage.tsx          # Ticket/call/agent productivity reports
│   │   │   ├── AuditPage.tsx            # Audit log table
│   │   │   ├── AgentPage.tsx            # Agent panel: tickets, callbacks, call simulator
│   │   │   ├── SettingsPage.tsx         # Profile, dark mode, change password
│   │   │   └── NotFoundPage.tsx         # 404 page
│   │   ├── redux/
│   │   │   ├── store.ts            # Redux store
│   │   │   └── slices/
│   │   │       ├── authSlice.ts    # User session, tokens (persisted to localStorage)
│   │   │       ├── uiSlice.ts      # Theme (dark/light), sidebar collapse
│   │   │       └── notificationSlice.ts # Unread notification count + items
│   │   ├── services/
│   │   │   └── api.ts              # Axios instance + all API functions by module
│   │   └── utils/
│   │       └── cn.ts               # Tailwind class merge utility
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts              # Vite + proxy to backend :8000
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── nginx.conf                  # Nginx config for frontend Docker container
│   └── Dockerfile                  # Frontend Docker image (build + nginx serve)
│
├── nginx/
│   └── nginx.conf                  # Reverse proxy: / → frontend, /api/ → backend
├── scripts/
│   └── init.sql                    # MySQL database init script
├── docker-compose.yml              # Full stack: mysql, redis, minio, backend, worker, beat, frontend, nginx
├── .env                            # Root environment variables for Docker Compose
└── .gitignore
```

---

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full system — all clients, all data, activate/deactivate clients |
| `client` | Own company — users, teams, forms, campaigns, tickets, settings |
| `team_user` | Permission-based — tickets, forms, reports (as granted) |
| `agent` | Agent panel — assigned tickets, calls, callbacks |

---

## Key Features

### Ticket Management
- Auto ticket number: `TKT-{client_id}-{sequence}`
- Status: Open → In Progress → Pending → Resolved → Closed → Reopened
- Priority: Low / Medium / High / Critical
- Internal notes (hidden from customer)
- Full activity timeline / audit log per ticket
- SLA due date tracking
- Merge tickets, link tickets

### Dynamic Form Builder
- Drag-and-drop field ordering
- Field types: Text, Textarea, Dropdown, Multi-Select, Checkbox, Radio, Date, Email, Mobile, Number, File
- Required field validation
- Conditional visibility rules
- Form versioning (snapshot on every save)
- Forms assigned to clients → appear in ticket creation

### How Forms Work
```
Admin/Client creates form in Form Builder
          ↓
Assign form to client (admin sets client_id)
          ↓
Client's agents see form in New Ticket dropdown
          ↓
Select form → dynamic fields appear → fill → submit
          ↓
Data stored in ticket.form_data (JSON)
```

### Calling Module
- Manual and Predictive campaigns
- Upload contacts via CSV / Excel
- Fields: name, mobile, alternate, email, city, state, priority, remarks
- Predictive campaigns → auto-push to dialer via Celery task
- Call logs with recording URL, duration, disposition
- Callback scheduling with reminder alerts

### Dialer Integration
- Webhook endpoint: `POST /api/v1/calls/dialer/webhook`
- Receives: call_id, status, duration, recording_url
- Updates matching CallLog record
- Supports VICIdial, Asterisk, SIP

### RBAC Permission System
```
Admin → full access (bypasses all checks)
Client → role-based permissions
  └── Role has permissions (RolePermission table)
  └── User can have extra/overridden permissions (UserPermission table)
  └── Permission check: role perms + user overrides
```

Permission slugs: `create_ticket`, `edit_ticket`, `close_ticket`, `assign_ticket`,
`export_ticket`, `view_reports`, `export_reports`, `upload_data`, `manual_calling`,
`predictive_calling`, `create_user`, `edit_user`, `create_form`, `edit_form`, etc.

### Escalation Engine (Celery Beat)
```
Every 5 min → check_escalations task
  → find tickets past SLA with escalation rules
  → Level 1: after 2h → notify team lead
  → Level 2: after 4h → notify manager  
  → Level 3: after 8h → notify admin
```

### Alert System
- Triggers: ticket_created, ticket_updated, ticket_closed, sla_breach, escalation, callback_reminder
- Channels: Email, SMS, WhatsApp, In-App
- Template variables: `{{customer_name}}`, `{{ticket_id}}`, `{{status}}`
- Recipients: customer, agent, team, escalation chain

---

## Running Locally (Without Docker)

### Prerequisites
- Python 3.10+
- Node.js 18+
- MySQL 8.0 (running)
- Redis (optional — Celery workers)

### 1. Database Setup
Open MySQL Workbench or CLI and run:
```sql
CREATE DATABASE IF NOT EXISTS cti_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cti_user'@'localhost' IDENTIFIED BY 'cti_pass123';
GRANT ALL PRIVILEGES ON cti_crm.* TO 'cti_user'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Backend
```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env         # Edit DATABASE_URL, SECRET_KEY

# Start server (auto creates tables + seeds admin user)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Access
| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/api/docs |

### Default Admin Credentials
```
Email:    admin@cti-crm.com
Password: Admin@123
```

---

## Running with Docker (Production / Ubuntu Server)

```bash
# Clone repo
git clone https://github.com/your-username/cti-crm.git
cd cti-crm

# Configure environment
cp .env.example .env
# Edit .env with production values

# Start all services
docker compose up -d

# Check status
docker compose ps
docker compose logs backend
```

### Services started by Docker Compose
| Container | Purpose |
|-----------|---------|
| `cti_mysql` | MySQL 8.0 database |
| `cti_redis` | Redis for Celery queue |
| `cti_minio` | File storage |
| `cti_backend` | FastAPI app on port 8000 |
| `cti_worker` | Celery worker (alerts, escalations, dialer) |
| `cti_beat` | Celery beat scheduler (cron tasks) |
| `cti_frontend` | React app served by Nginx |
| `cti_nginx` | Reverse proxy on port 80 |

---

## API Overview

All endpoints are prefixed with `/api/v1/`

| Module | Endpoints |
|--------|-----------|
| Auth | `POST /auth/login/` `POST /auth/register/` `POST /auth/refresh/` `GET /auth/me` |
| Clients | `GET/PATCH /clients/` `POST /clients/{id}/activate` |
| Users | `GET/POST /users/` `GET/POST /users/roles/` `GET /users/permissions/list` |
| Tickets | `GET/POST /tickets/` `GET/PATCH /tickets/{id}` `POST /tickets/{id}/close` |
| Forms | `GET/POST /forms/` `GET/PATCH /forms/{id}` `POST /forms/{id}/assign` |
| Calls | `GET/POST /calls/campaigns/` `POST /calls/campaigns/{id}/upload` `GET /calls/logs/` |
| Alerts | `GET/POST /alerts/` `GET/POST /alerts/escalations/` `GET /alerts/templates` |
| Reports | `GET /reports/dashboard` `GET /reports/tickets` `GET /reports/agent-productivity` |
| Notifications | `GET /notifications/` `POST /notifications/{id}/read` |
| Audit | `GET /audit/` |
| WebSocket | `WS /ws?token=<access_token>` |

Full interactive docs: **http://localhost:8000/api/docs**

---

## Database Tables

| Table | Description |
|-------|-------------|
| `users` | All users (admin, client, team_user, agent) |
| `roles` | Custom roles per client |
| `permissions` | System permission definitions |
| `role_permissions` | Role → permission mapping |
| `user_permissions` | User-level permission overrides |
| `clients` | Registered companies |
| `departments` | Client departments |
| `teams` | Teams within departments |
| `team_members` | User → team mapping |
| `tickets` | Support tickets |
| `ticket_comments` | Comments + internal notes |
| `ticket_logs` | Field change history |
| `ticket_attachments` | File attachments |
| `forms` | Dynamic form definitions |
| `form_fields` | Fields within a form |
| `form_field_rules` | Conditional visibility rules |
| `form_versions` | Snapshot on each form save |
| `alerts` | Alert rule configurations |
| `alert_templates` | Email/SMS/WhatsApp templates |
| `escalation_rules` | Multi-level escalation configs |
| `escalation_logs` | Escalation trigger history |
| `campaigns` | Calling campaigns |
| `upload_batches` | CSV/Excel upload sessions |
| `upload_records` | Individual contact records |
| `call_logs` | Call detail records |
| `callback_schedules` | Scheduled callback reminders |
| `notifications` | In-app notifications |
| `audit_logs` | Full system audit trail |
| `user_sessions` | Refresh token sessions |

---

## Environment Variables

```env
# Database
DATABASE_URL=mysql+aiomysql://cti_user:cti_pass123@localhost:3306/cti_crm

# Security
SECRET_KEY=your-strong-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# Redis (for Celery workers)
REDIS_URL=redis://localhost:6379/0

# File Storage (MinIO)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=cti-files

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password

# App
FRONTEND_URL=http://localhost:3000
DEBUG=false
```

---

## Git Workflow

```bash
# First time push
git remote add origin https://github.com/your-username/cti-crm.git
git branch -M main
git push -u origin main

# Daily workflow
git add .
git commit -m "your message"
git push
```

---

## Separate Projects

| Project | Folder | Purpose |
|---------|--------|---------|
| VBots | `D:\Project\vbots` | LiveKit SIP + AI voice calling |
| CTI CRM | `D:\Project\CTI` | Enterprise CRM + Ticketing + Dialer |
