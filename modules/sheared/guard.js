// public/js/guard.js

/**
 * Validates session against GET /api/signin/me and enforces required roles.
 * @param {Array<string>} [allowedRoles] - Optional list of required roles (e.g., ['super_admin'])
 */
async function requireAuth(allowedRoles = []) {
  try {
    // Session token cookie is automatically attached by browser
    const response = await fetch("/api/signin/me");

    if (!response.ok) {
      window.location.href = "/signin.html";
      return;
    }

    const data = await response.json();
    const user = data.user;

    // Verify user role if allowedRoles array is provided
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      alert("Unauthorized access: Your account role is not permitted here.");
      window.location.href = "/signin.html";
      return;
    }

    // Attach user to global scope for dashboard rendering
    window.currentUser = user;
    
  } catch (error) {
    console.error("Auth Guard Error:", error);
    window.location.href = "/signin.html";
  }
}

/**
 * Log out handler for dashboard logout buttons
 */
async function handleLogout() {
  try {
    await fetch("/api/signin/logout", { method: "POST" });
    window.location.href = "/signin.html";
  } catch (error) {
    console.error("Logout error:", error);
  }
}