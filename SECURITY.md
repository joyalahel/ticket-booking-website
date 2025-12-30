# Security Policy

## 🔒 Security Measures

This project follows security best practices to protect sensitive data and ensure application integrity.

### 1. Environment Variable Management
All sensitive information is stored in environment variables and never hardcoded in the source code:
- Database credentials (Host, Port, User, Password)
- API Keys (Resend, etc.)
- Email configurations

### 2. Database Security
- We use connection pooling with `mysql2/promise`.
- SSL connections are supported for database communication.
- Prepared statements are used to prevent SQL injection attacks.

### 3. Authentication & Authorization
- User passwords should be hashed before storage (ensure your `authRoutes` implement this).
- Sensitive API endpoints are protected and require valid authentication.

### 4. Real-time Communication
- WebSockets (Socket.io) are configured with CORS restrictions to prevent unauthorized connections.

## Deployment Checklist

- [ ] Change all default passwords.
- [ ] Use a strong, unique `RESEND_API_KEY`.
- [ ] Ensure `NODE_ENV` is set to `production` in your live environment.
- [ ] Enable HTTPS on your production server.
- [ ] Regularly update dependencies to patch security vulnerabilities.

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please do not open a public issue. Instead, contact the maintainer directly at [your-email@example.com].

---

**Note**: This project was automatically scanned and secured before being pushed to GitHub to remove any pre-existing hardcoded credentials.
