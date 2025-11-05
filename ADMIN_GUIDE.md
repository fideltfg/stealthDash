# Admin Quick Reference

## Making Your First Admin User

After initial setup, make the first user an admin:

```bash
# SSH into your server or run locally
cd /home/concordia/Dashboard

# Make the first registered user an admin
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE id = (SELECT MIN(id) FROM users);"
```

Or make a specific user admin by username:
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE username = 'your_username';"
```

## Common Admin Tasks

### View All Users
```bash
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c \
  "SELECT id, username, email, is_admin, created_at FROM users ORDER BY id;"
```

### Make User Admin via Database
```bash
# By username
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE username = 'john';"

# By user ID
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE id = 5;"
```

### Remove Admin Privileges via Database
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = false WHERE username = 'john';"
```

### Reset Password Manually via Database
```bash
# Generate password hash using Node.js
docker exec -it dashboard-ping-server node -e \
  "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('newpassword123', 10));"

# Copy the hash and update user
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET password_hash = '\$2a\$10\$...' WHERE username = 'john';"
```

### Delete User via Database
```bash
# Delete user (will cascade delete their dashboard)
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "DELETE FROM users WHERE username = 'john';"
```

### View Database Statistics
```bash
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c \
  "SELECT 
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM users WHERE is_admin = true) as admin_users,
    (SELECT COUNT(*) FROM dashboards) as total_dashboards;"
```

## Troubleshooting

### Admin Button Not Showing
1. Check if user is admin in database:
```bash
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c \
  "SELECT username, is_admin FROM users WHERE username = 'your_username';"
```

2. If is_admin is false, update it:
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE username = 'your_username';"
```

3. Logout and login again to refresh the profile

### "Unauthorized" Error on Admin Actions
- Verify you're logged in as an admin user
- Check server logs: `docker logs dashboard-ping-server --tail 50`
- Ensure JWT token is valid (not expired)

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check database logs
docker logs dashboard-postgres --tail 50

# Test database connection
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c "SELECT 1;"
```

### Reset Everything (Nuclear Option)
```bash
# WARNING: This deletes ALL data
docker compose down -v
docker compose up -d --build

# Wait for database to initialize, then run migration
sleep 10
docker exec -i dashboard-postgres psql -U dashboard -d dashboard < ping-server/init-db.sql
```

## API Testing with curl

### Login
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

### Get All Users (Admin)
```bash
# Save token from login response
TOKEN="your_jwt_token_here"

curl -X GET http://localhost:3001/admin/users \
  -H "Authorization: Bearer $TOKEN"
```

### Make User Admin
```bash
curl -X POST http://localhost:3001/admin/users/2/make-admin \
  -H "Authorization: Bearer $TOKEN"
```

### Get Admin Stats
```bash
curl -X GET http://localhost:3001/admin/stats \
  -H "Authorization: Bearer $TOKEN"
```

### Reset User Password
```bash
curl -X POST http://localhost:3001/admin/users/3/reset-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"newPassword":"newpass123"}'
```

### Delete User
```bash
curl -X DELETE http://localhost:3001/admin/users/3 \
  -H "Authorization: Bearer $TOKEN"
```

## Best Practices

1. **Always have at least 2 admin users** - In case one account has issues
2. **Use strong passwords** - Minimum 12 characters, mix of letters, numbers, symbols
3. **Regular backups** - Backup the PostgreSQL database regularly
4. **Monitor admin actions** - Check server logs for admin activity
5. **Don't share admin accounts** - Each admin should have their own account
6. **Review users periodically** - Remove inactive users

## Backup and Restore

### Backup Database
```bash
docker exec dashboard-postgres pg_dump -U dashboard dashboard > backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
cat backup_20250105.sql | docker exec -i dashboard-postgres psql -U dashboard dashboard
```

### Backup Just Users
```bash
docker exec dashboard-postgres pg_dump -U dashboard -t users dashboard > users_backup.sql
```

## Environment Variables

Configured in `docker-compose.yml`:
- `POSTGRES_USER=dashboard`
- `POSTGRES_PASSWORD=dashboardpass`
- `POSTGRES_DB=dashboard`
- `JWT_SECRET=your-secret-key-change-in-production`

**Important**: Change JWT_SECRET in production!

## Support

For issues or questions:
1. Check server logs: `docker logs dashboard-ping-server`
2. Check database logs: `docker logs dashboard-postgres`
3. Check frontend console: Browser DevTools → Console tab
4. Review AUTH_SYSTEM.md for API documentation
5. Review USER_MANAGEMENT.md for feature documentation
