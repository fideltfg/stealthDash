# Default Admin Credentials

## Initial Setup

When you first build the containers, a default admin user is automatically created:

**Username:** `admin`  
**Password:** `admin123`  
**Email:** `admin@dashboard.local`

## First Login

1. Visit **http://localhost:3000**
2. Click the login/register dialog
3. Login with:
   - Username: `admin`
   - Password: `admin123`

## ⚠️ IMPORTANT SECURITY NOTICE

**Change the default password immediately after first login!**

### How to Change the Default Password

1. Login with the default credentials
2. Click the **⚙️ Settings** button in the top right user menu
3. Go to the "Change Password" section (yellow)
4. Enter:
   - Current Password: `admin123`
   - New Password: Your secure password
   - Confirm New Password: Your secure password
5. Click "Change Password"

### Production Deployment

For production deployments:
1. **Change the password immediately** after first login
2. Consider removing the default admin user and creating a new one with a secure username
3. Update the `JWT_SECRET` in `docker-compose.yml`
4. Use strong, unique passwords for all users

## Database Seed Details

The default admin user is created by `ping-server/init-db.sql` during database initialization.

The INSERT statement uses a `WHERE NOT EXISTS` clause, so:
- ✅ The admin user is only created if no users exist
- ✅ Rebuilding containers won't duplicate the admin user
- ✅ If you delete the postgres volume, the admin user will be recreated

## Removing Default Admin

If you want to remove the default admin user after creating your own admin account:

```bash
# Delete the default admin user
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "DELETE FROM users WHERE username = 'admin';"
```

**Note:** Make sure you have another admin user before deleting the default one!

## Creating Additional Admins

### Via UI (Recommended)
1. Login as admin
2. Click **👑 Admin** button
3. Find the user you want to promote
4. Click **Make Admin**

### Via Command Line
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE username = 'your_username';"
```
