# TrendHunter Admin Setup

console.log('Use create-all-tables.sql for complete setup')

console.log("Steps to configure admin access:")
console.log("1. Execute create-all-tables.sql in Supabase SQL Editor")
console.log("2. Create admin user manually in Supabase Auth:")
console.log("   - Email: admin@trendhunter.com");
console.log("   - Password: Admin1234!");
console.log('   - Check "Confirm email"');
console.log("3. Run UPDATE commands in create-all-tables.sql");
console.log("");
console.log("The middleware is configured to:");
console.log("   - Protect /admin routes");
console.log("   - Redirect admins to /admin after login");
console.log("   - Deny access to non-admins");
