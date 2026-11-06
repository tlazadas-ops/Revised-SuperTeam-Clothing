// ===============================
// SUPABASE (same project as the store)
// ===============================

const SUPABASE_URL = "https://fncmvimsrdawvaapspyt.supabase.co";
const SUPABASE_KEY = "sb_publishable_8IVztGk6akNofrqgnci04g_HekLzPZ3";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const STATUS_STEPS = [
    "Order Received",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled"
];

let allOrders = [];
let currentFilter = "All";

// ===============================
// AUTH GATE
// ===============================

async function adminLogin() {

    const email = document.getElementById("admin-email").value.trim();
    const password = document.getElementById("admin-password").value;
    const errorBox = document.getElementById("admin-login-error");

    errorBox.textContent = "";

    if (!email || !password) {
        errorBox.textContent = "Please enter your email and password.";
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error || !data.user) {
        errorBox.textContent = "Login failed: " + (error?.message || "Unknown error");
        return;
    }

    await checkAdminAndLoad();
}

async function adminLogout() {

    await supabaseClient.auth.signOut();
    document.getElementById("admin-dashboard").style.display = "none";
    document.getElementById("admin-login-screen").style.display = "block";
    document.getElementById("admin-logout-btn").style.display = "none";
}

async function checkAdminAndLoad() {

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) return;

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (error || !profile || profile.role !== "admin") {

        document.getElementById("admin-login-error").textContent =
            "This account does not have admin access.";

        await supabaseClient.auth.signOut();
        return;
    }

    document.getElementById("admin-login-screen").style.display = "none";
    document.getElementById("admin-dashboard").style.display = "block";
    document.getElementById("admin-logout-btn").style.display = "inline-block";

    loadOrders();

    // Live updates when a new order comes in
    supabaseClient
        .channel("admin-orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
            loadOrders();
        })
        .subscribe();
}

// ===============================
// LOAD + RENDER ORDERS
// ===============================

async function loadOrders() {

    const { data, error } = await supabaseClient
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        document.getElementById("admin-orders-list").innerHTML =
            `<p>Failed to load orders: ${error.message}</p>`;
        return;
    }

    allOrders = data || [];
    renderStats();
    renderOrders();
}

function renderStats() {

    const statsBox = document.getElementById("admin-stats");

    const total = allOrders.length;
    const pending = allOrders.filter(o => o.status !== "Delivered" && o.status !== "Cancelled").length;
    const delivered = allOrders.filter(o => o.status === "Delivered").length;
    const revenue = allOrders
        .filter(o => o.status !== "Cancelled")
        .reduce((sum, o) => sum + Number(o.total || 0), 0);

    statsBox.innerHTML = `
        <div class="admin-stat"><strong>${total}</strong><span>TOTAL ORDERS</span></div>
        <div class="admin-stat"><strong>${pending}</strong><span>IN PROGRESS</span></div>
        <div class="admin-stat"><strong>${delivered}</strong><span>DELIVERED</span></div>
        <div class="admin-stat"><strong>₱${revenue.toLocaleString()}</strong><span>REVENUE</span></div>
    `;
}

function setAdminFilter(status) {

    currentFilter = status;

    document.querySelectorAll("#admin-filter button").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.status === status);
    });

    renderOrders();
}

function badgeClass(status) {
    switch (status) {
        case "Processing": return "badge-processing";
        case "Shipped": return "badge-shipped";
        case "Delivered": return "badge-delivered";
        case "Cancelled": return "badge-cancelled";
        default: return "badge-received";
    }
}

function renderOrders() {

    const list = document.getElementById("admin-orders-list");

    const filtered = currentFilter === "All"
        ? allOrders
        : allOrders.filter(o => o.status === currentFilter);

    if (filtered.length === 0) {
        list.innerHTML = "<p>No orders in this view.</p>";
        return;
    }

    list.innerHTML = filtered.map(order => {

        const items = Array.isArray(order.items) ? order.items : [];

        const itemsHTML = items.map(item => `
            <div class="admin-item-line">
                • ${item.name} — Size ${item.size || "N/A"} × ${item.quantity} (₱${item.price})
            </div>
        `).join("");

        const options = STATUS_STEPS.map(step =>
            `<option value="${step}" ${step === order.status ? "selected" : ""}>${step}</option>`
        ).join("");

        return `
            <div class="admin-order-card">
                <div class="admin-order-top">
                    <h3>🛍️ ${order.order_id}</h3>
                    <span class="admin-badge ${badgeClass(order.status)}">${order.status}</span>
                </div>

                <p>👤 ${order.customer_name} (@${order.username})</p>
                <p>📞 ${order.contact}</p>
                <p>📍 ${order.address}</p>
                <p>💳 ${order.payment} — ₱${Number(order.total).toLocaleString()}</p>
                <p>📅 ${new Date(order.created_at).toLocaleString()}</p>

                ${itemsHTML}

                <select class="admin-status-select" onchange="updateOrderStatus('${order.order_id}', this.value)">
                    ${options}
                </select>
            </div>
        `;
    }).join("");
}

async function updateOrderStatus(orderId, newStatus) {

    const { error } = await supabaseClient
        .from("orders")
        .update({ status: newStatus })
        .eq("order_id", orderId);

    if (error) {
        alert("Could not update order: " + error.message);
        return;
    }

    loadOrders();
}

// ===============================
// BOOT
// ===============================

document.addEventListener("DOMContentLoaded", async () => {

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (user) {
        await checkAdminAndLoad();
    }
});
