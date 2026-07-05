// ==========================================
// 🚀 ADMIN COMMAND CENTER ENGINE
// ==========================================

// 1. Firebase Keys (MUST match your main app exactly)
const firebaseConfig = {
  apiKey: "AIzaSyC9-SkZtquTnt_4F08vkXO71O9u21_r5b8",
  authDomain: "sanskrit-vartika.firebaseapp.com",
  projectId: "sanskrit-vartika",
  storageBucket: "sanskrit-vartika.firebasestorage.app",
  messagingSenderId: "335310316057",
  appId: "1:335310316057:web:6949c57ac8923591070088",
  measurementId: "G-KT34D6Y4B4"
};

// 2. Initialize
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 3. Security Constant
const ADMIN_EMAIL = "enquiry.sanskritvartika@gmail.com";
let adminUserList = [];
let currentFilteredUsers = [];
let currentUser = null; // Track the logged-in admin

// --- UTILITIES ---
function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

function switchTab(tabName) {
  // Hide all tabs and remove active class
  document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  // Show target tab
  document.getElementById('tab-' + tabName).style.display = 'block';
  event.target.classList.add('active');
  
  // NOTE: We intentionally DO NOT auto-load reports here to save Firebase reads!
}

// --- AUTHENTICATION ---
auth.onAuthStateChanged((user) => {
  if (user && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    currentUser = user; // Set global admin user
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
  } else {
    currentUser = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('dashboard-screen').style.display = 'none';
    if (user) auth.signOut(); // Kick out anyone who isn't the master admin
  }
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('admin-email').value.trim();
  const pass = document.getElementById('admin-password').value;
  const errBox = document.getElementById('login-error');
  
  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    errBox.textContent = "Access Denied: Unauthorized Email.";
    errBox.style.display = 'block';
    return;
  }

  const btn = document.getElementById('login-btn');
  btn.textContent = "Authenticating...";
  btn.disabled = true;

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    errBox.style.display = 'none';
  } catch (error) {
    errBox.textContent = error.message;
    errBox.style.display = 'block';
  } finally {
    btn.textContent = "Secure Login 🔒";
    btn.disabled = false;
  }
});

function logoutAdmin() {
  auth.signOut().then(() => {
    adminUserList = [];
    document.getElementById('admin-users-body').innerHTML = '<tr><td colspan="8" style="text-align: center;">Logged out.</td></tr>';
  });
}

// --- CORE DASHBOARD LOGIC (STUDENTS) ---
async function loadAdminDashboard() {
  const tbody = document.getElementById('admin-users-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Fetching data from Cloud... Please wait.</td></tr>';

  try {
    const fetchType = document.getElementById('admin-fetch-type').value;
    const statusDropdown = document.getElementById('admin-filter-status'); // NEW: Grab the second dropdown
    let query = db.collection("users");

    // --- BUG FIX: SAFER FETCH & AUTO UI SYNC ---
    if (fetchType === 'basic') {
      query = query.where('accessLevel', '==', 'basic');
      statusDropdown.value = 'free'; // Auto-sync the UI
    } 
    else if (fetchType !== 'all') {
      // FIXED: Changed '>' to '!=' null. This is much safer and guarantees it catches valid passes!
      query = query.where(`passes.${fetchType}`, '!=', null);
      statusDropdown.value = fetchType; // Auto-sync the UI
    } 
    else {
      statusDropdown.value = 'all'; // Auto-sync the UI
    }

    const snapshot = await query.get();
    adminUserList = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      data.uid = doc.id;
      
      const passes = data.passes || {};
      const now = new Date();
      data.computedStatus = "free";
      let hasActive = false, hasExpired = false;

      Object.keys(passes).forEach(p => {
        if (passes[p]) {
          if (new Date(passes[p]) > now) hasActive = true;
          else hasExpired = true;
        }
      });

      if (hasActive) data.computedStatus = "vip"; 
      else if (hasExpired) data.computedStatus = "expired";
      
      adminUserList.push(data);
    });

    filterAndRenderAdminTable(); 
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: red;">Error: ${error.message}</td></tr>`;
  }
}

// --- 🚀 NEW: 1-READ QUICK FETCH ENGINE ---
async function fetchSingleUserByEmail() {
  const emailInput = document.getElementById('admin-quick-email').value.trim().toLowerCase();
  if (!emailInput) return showToast("⚠️ Please enter an email address.");

  // UI Loading State
  const btn = document.querySelector('button[onclick="fetchSingleUserByEmail()"]');
  const originalText = btn.textContent;
  btn.textContent = "Fetching...";
  btn.disabled = true;

  const tbody = document.getElementById('admin-users-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Executing 1-Read Query... Please wait.</td></tr>';

  try {
    // 🎯 The exact query: Limit to 1 to guarantee zero waste!
    const snapshot = await db.collection("users").where("email", "==", emailInput).limit(1).get();
    
    if (snapshot.empty) {
      adminUserList = [];
      document.getElementById('admin-user-count').textContent = "0";
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #D32F2F;">No student found registered with email: <strong>${escapeHTML(emailInput)}</strong></td></tr>`;
      return;
    }

    // Clear old data and populate with just this 1 user
    adminUserList = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      data.uid = doc.id;
      
      const passes = data.passes || {};
      const now = new Date();
      data.computedStatus = "free";
      let hasActive = false, hasExpired = false;

      // 🚀 FIX: Dynamic loop for Single Fetch!
      Object.keys(passes).forEach(p => {
        if (passes[p]) {
          if (new Date(passes[p]) > now) hasActive = true;
          else hasExpired = true;
        }
      });

      if (hasActive) data.computedStatus = "vip"; 
      else if (hasExpired) data.computedStatus = "expired";
      
      adminUserList.push(data);
    });

    // 🚀 UX FIX: Reset the local dropdown filters so the fetched user is guaranteed to show up on screen!
    document.getElementById('admin-search').value = '';
    document.getElementById('admin-filter-status').value = 'all';

    // Render the table
    filterAndRenderAdminTable();
    showToast("✅ Student loaded successfully! (Cost: 1 Read)");
    
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: red;">Error: ${error.message}</td></tr>`;
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// Attach live search
document.getElementById('admin-search').addEventListener('input', filterAndRenderAdminTable);
document.getElementById('admin-filter-status').addEventListener('change', filterAndRenderAdminTable);

function filterAndRenderAdminTable() {
  const searchQuery = document.getElementById('admin-search').value.toLowerCase();
  const statusFilter = document.getElementById('admin-filter-status').value;
  const now = new Date();

  currentFilteredUsers = adminUserList.filter(user => {
    const searchMatch = (user.name || "").toLowerCase().includes(searchQuery) || 
                        (user.email || "").toLowerCase().includes(searchQuery) || 
                        (user.whatsapp || "").toLowerCase().includes(searchQuery);
    
    let statusMatch = false;
    if (statusFilter === "all") statusMatch = true;
    else if (statusFilter === "free") statusMatch = (user.computedStatus === "free" || user.computedStatus === "expired");
    else statusMatch = (user.passes && user.passes[statusFilter] && new Date(user.passes[statusFilter]) > now);

    return searchMatch && statusMatch;
  });

  // Sort newest first
  currentFilteredUsers.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  document.getElementById('admin-user-count').textContent = currentFilteredUsers.length;
  const tbody = document.getElementById('admin-users-body');
  
  if (currentFilteredUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-light);">No students match this criteria.</td></tr>';
    return;
  }

  let html = '';
  currentFilteredUsers.forEach(data => {
    const dateJoined = data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-IN') : 'Unknown';
    let vipBadge = '', validityText = '';

    if (data.computedStatus === "free" || data.computedStatus === "expired") {
      vipBadge = '<span style="background: #E0E0E0; color: #757575; padding: 4px 8px; border-radius: 50px; font-size: 0.75rem; font-weight: bold;">Basic Access</span>';
      validityText = '<span style="color: #9E9E9E;">—</span>';
    } else {
      let activeTags = [];
      let validityHTML = '';
      
      const pColors = { batch: '#E65100', sanskrit: '#1565C0', bengali: '#9C27B0', philosophy: '#00838F', general: '#2E7D32' };
      
      Object.keys(data.passes || {}).forEach(p => {
        if (data.passes[p]) {
          const expDate = new Date(data.passes[p]);
          if (expDate > now) {
            activeTags.push(p.toUpperCase());
            const cColor = pColors[p] || '#1565C0'; // Fallback color
            validityHTML += `<div style="font-size:0.75rem; color:${cColor}; margin-bottom:2px; font-weight: bold;">${p.toUpperCase()}: <span style="color:var(--text-mid); font-weight:normal;">${expDate.toLocaleDateString('en-IN')}</span></div>`;
          }
        }
      });
      vipBadge = `<span style="background: #FFF3E0; color: #E65100; padding: 4px 8px; border-radius: 50px; font-size: 0.7rem; font-weight: bold;">${activeTags.join(', ')}</span>`;
      validityText = validityHTML;
    }

    let waLink = data.whatsapp ? `<a href="https://wa.me/${data.whatsapp.replace(/\D/g,'')}" target="_blank" style="color: #25D366; font-weight: bold; text-decoration: underline;">${data.whatsapp}</a>` : '—';
    
    // 🚀 Dynamically render the Core Subject Badge
    let coreSubjDisplay = 'Sanskrit';
    let coreColor = '#1565C0'; // Blue for Sanskrit
    if (data.coreSubject === 'bengali') { coreSubjDisplay = 'Bengali'; coreColor = '#9C27B0'; }
    else if (data.coreSubject === 'philosophy') { coreSubjDisplay = 'Philosophy'; coreColor = '#00838F'; }
    
    let coreBadge = `<span style="border: 1px solid ${coreColor}; color: ${coreColor}; padding: 2px 8px; border-radius: 50px; font-size: 0.7rem; font-weight: bold; background: rgba(255,255,255,0.8);">${coreSubjDisplay}</span>`;

    html += `
      <tr>
        <td style="font-weight: 600; color: var(--brown);">${escapeHTML(data.name || 'Unknown')}</td>
        <td style="color: var(--text-mid); font-size: 0.85rem;">${escapeHTML(data.email)}</td>
        <td>${coreBadge}</td>
        <td>${waLink}</td>
        <td style="color: var(--text-light); font-size: 0.85rem;">${dateJoined}</td>
        <td>${vipBadge}</td>
        <td>${validityText}</td>
        <td style="text-align: right;">
          <button class="btn btn-outline" style="padding: 4px 12px; font-size: 0.8rem; margin-right: 4px;" onclick="openAdminStats('${data.uid}')">📊 Stats</button>
          <button class="btn btn-outline" style="padding: 4px 12px; font-size: 0.8rem;" onclick="openAdminEdit('${data.uid}')">⚙️ Manage</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// --- INDIVIDUAL STUDENT MANAGEMENT ---
function openAdminEdit(uid) {
  const user = adminUserList.find(u => u.uid === uid);
  if (!user) return;

  document.getElementById('admin-edit-name').textContent = `${user.name} (${user.email})`;
  const p = user.passes || {};
  const formatD = (iso) => {
    if (!iso) return '';
    let d = new Date(iso);
    return isNaN(d) ? '' : d.toISOString().split('T')[0]; // 🚀 SAFEGUARD: Prevents crashes on corrupted DB dates!
  };
  
  // Wire up the inputs!
  document.getElementById('admin-pass-general').value = formatD(p.general);
  document.getElementById('admin-pass-sanskrit').value = formatD(p.sanskrit);
  document.getElementById('admin-pass-bengali').value = formatD(p.bengali);
  document.getElementById('admin-pass-philosophy').value = formatD(p.philosophy);
  document.getElementById('admin-pass-batch').value = formatD(p.batch);

  document.getElementById('admin-edit-save-btn').onclick = () => saveAdminEdit(uid);
  document.getElementById('admin-edit-modal').style.display = 'flex';
}

function applyQuickDays() {
  const days = parseInt(document.getElementById('quick-add-days').value);
  const targetId = document.getElementById('quick-add-target').value;
  if (!days || days <= 0) return showToast("⚠️ Enter a valid number of days");
  
  const newDate = new Date();
  newDate.setDate(newDate.getDate() + days);
  document.getElementById(targetId).value = newDate.toISOString().split('T')[0];
  showToast(`Calculated: ${days} days added from today!`);
}

async function saveAdminEdit(uid) {
  const btn = document.getElementById('admin-edit-save-btn');
  btn.textContent = "Saving..."; btn.disabled = true;

  // Save the new inputs to the database!
  const getIso = (val) => val ? new Date(val).toISOString() : null;
  const newPasses = {
    general: getIso(document.getElementById('admin-pass-general').value),
    sanskrit: getIso(document.getElementById('admin-pass-sanskrit').value),
    bengali: getIso(document.getElementById('admin-pass-bengali').value),
    philosophy: getIso(document.getElementById('admin-pass-philosophy').value),
    batch: getIso(document.getElementById('admin-pass-batch').value)
  };

  let hasActive = false;
  const now = new Date();
  Object.values(newPasses).forEach(iso => { if (iso && new Date(iso) > now) hasActive = true; });
  const newAccessLevel = hasActive ? "premium" : "basic";

  try {
    await db.collection("users").doc(uid).update({ passes: newPasses, accessLevel: newAccessLevel });
    showToast("✅ Student passes updated!");
    document.getElementById('admin-edit-modal').style.display = 'none';
    
    // Update the local RAM array instead of doing a massive database re-fetch!
    const userIndex = adminUserList.findIndex(u => u.uid === uid);
    if (userIndex !== -1) {
      adminUserList[userIndex].passes = newPasses;
      adminUserList[userIndex].accessLevel = newAccessLevel;
      
      // Re-calculate their VIP status locally
      let isStillVIP = false;
      let isExpired = false;
      Object.keys(newPasses).forEach(p => {
        if (newPasses[p]) {
          if (new Date(newPasses[p]) > new Date()) isStillVIP = true;
          else isExpired = true;
        }
      });
      adminUserList[userIndex].computedStatus = isStillVIP ? "vip" : (isExpired ? "expired" : "free");
    }

    // Instantly redraw the table and charts with the new local data (Cost: 0 Reads)
    filterAndRenderAdminTable();
    if (document.getElementById('tab-analytics').style.display === 'block') {
      loadAnalyticsEngine();
    }
    
  } catch (error) { alert(error.message); }
  finally { btn.textContent = "Save Passes"; btn.disabled = false; }
}

// --- BULK UPGRADE ENGINE ---
async function executeBulkUpdate() {
  const targetGroup = document.getElementById('bulk-target-group').value;
  const targetPass = document.getElementById('bulk-pass-type').value;
  const daysToAdd = parseInt(document.getElementById('bulk-days').value);
  
  if (!daysToAdd || daysToAdd <= 0) return alert("Please enter a valid number of days.");

  const usersToUpdate = adminUserList.filter(u => targetGroup === "all" || u.computedStatus === targetGroup);
  if (usersToUpdate.length === 0) return alert("No users found in the currently loaded table.");
  if (!confirm(`Are you sure you want to add ${daysToAdd} days of ${targetPass.toUpperCase()} to ${usersToUpdate.length} students?`)) return;

  const btn = document.getElementById('bulk-execute-btn');
  btn.textContent = "Processing..."; btn.disabled = true;

  try {
    const chunkSize = 200; // Firebase batch write limit safety
    for (let i = 0; i < usersToUpdate.length; i += chunkSize) {
      const chunk = usersToUpdate.slice(i, i + chunkSize);
      const batch = db.batch();

      chunk.forEach(user => {
        const userRef = db.collection("users").doc(user.uid);
        let currentPasses = user.passes || {};
        let newExpiry = new Date(); 
        
        // If they already have this specific pass, extend from the existing date
        if (currentPasses[targetPass] && new Date(currentPasses[targetPass]) > new Date()) {
          newExpiry = new Date(currentPasses[targetPass]);
        }
        
        newExpiry.setDate(newExpiry.getDate() + daysToAdd);
        currentPasses[targetPass] = newExpiry.toISOString();
        batch.update(userRef, { passes: currentPasses, accessLevel: 'premium' });
      });

      await batch.commit(); 
    }
    showToast(`✅ Successfully updated ${usersToUpdate.length} students!`);
    document.getElementById('bulk-manage-modal').style.display = 'none';
    document.getElementById('bulk-days').value = '';
    
    // LEAK PATCH: Update RAM instead of re-fetching the database!
    usersToUpdate.forEach(user => {
      const userIndex = adminUserList.findIndex(u => u.uid === user.uid);
      if (userIndex !== -1) {
        let currentPasses = adminUserList[userIndex].passes || {};
        let newExpiry = new Date();
        if (currentPasses[targetPass] && new Date(currentPasses[targetPass]) > new Date()) {
          newExpiry = new Date(currentPasses[targetPass]);
        }
        newExpiry.setDate(newExpiry.getDate() + daysToAdd);
        currentPasses[targetPass] = newExpiry.toISOString();
        
        adminUserList[userIndex].passes = currentPasses;
        adminUserList[userIndex].accessLevel = 'premium';
        adminUserList[userIndex].computedStatus = "vip"; // Force VIP status since we added days
      }
    });
    
    filterAndRenderAdminTable(); // Redraw table instantly
    if (document.getElementById('tab-analytics').style.display === 'block') loadAnalyticsEngine();
    
  } catch (error) { alert("Error: " + error.message); } 
  finally { btn.textContent = "Execute Bulk Update"; btn.disabled = false; }
}

// --- ERROR REPORTS ENGINE ---
async function loadAdminReports() {
  const tbody = document.getElementById('admin-reports-body');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Fetching reports...</td></tr>';

  try {
    const snapshot = await db.collection("reported_errors").orderBy("timestamp", "desc").limit(50).get();
    document.getElementById('admin-reports-count').textContent = snapshot.size;

    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No reported errors! 🎉</td></tr>';
      return;
    }

    let html = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const date = data.timestamp ? data.timestamp.toDate().toLocaleDateString('en-IN') : 'Just now';
      
      html += `
        <tr>
          <td style="max-width: 350px;">
            <strong style="color: var(--brown); font-size: 0.85rem;">${escapeHTML(data.testName || 'Unknown Test')}</strong>
            
            <div style="font-family: 'Tiro Devanagari Sanskrit', serif; font-size: 0.95rem; margin-top: 8px; max-height: 180px; overflow: auto; background: #FAFAFA; border: 1px dashed #E0E0E0; padding: 8px; border-radius: 4px;">
              ${data.questionText}
            </div>
          </td>
          <td>
            <span style="background: #FFEBEE; color: #D32F2F; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">${data.reason}</span><br>
            <span style="font-size: 0.85rem; color: #666; display: block; margin-top: 4px;">${escapeHTML(data.comment || 'No comment provided')}</span>
          </td>
          <td style="font-size: 0.85rem; color: var(--text-mid);">${data.reportedBy}</td>
          <td style="font-size: 0.85rem; color: var(--text-light);">${date}</td>
          <td style="text-align: right;">
            <button class="btn btn-primary" style="background: #4CAF50; padding: 6px 12px; font-size: 0.8rem;" onclick="resolveReport('${doc.id}', this)">✅ Resolve</button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (error) { tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Error: ${error.message}</td></tr>`; }
}

// 🚀 LEAK PATCH: Receive the button element, and remove the row locally!
async function resolveReport(reportId, btnElement) {
  if (!confirm("Resolve this report? Ensure you have fixed the error in your Google Sheet first!")) return;
  
  // Create a loading state on the button
  const originalText = btnElement.textContent;
  btnElement.textContent = "⏳..."; btnElement.disabled = true;

  try {
    await db.collection("reported_errors").doc(reportId).delete();
    showToast("✅ Report resolved and cleared.");
    
    // Remove the row from the HTML table without re-fetching data!
    const row = btnElement.closest('tr');
    if (row) row.remove();
    
    // Update the counter at the top
    const countEl = document.getElementById('admin-reports-count');
    if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
    
  } catch (error) { 
    alert("Error resolving report: " + error.message); 
    btnElement.textContent = originalText; btnElement.disabled = false;
  }
}

// --- CSV EXPORT ENGINE ---
function exportToCSV() {
  if (currentFilteredUsers.length === 0) return showToast("⚠️ No students found to export!");

  // 🚀 FIX: Added "Core Subject" to the column headers
  let csvContent = "Name,Email,Core Subject,WhatsApp,Date Joined,Param Status,Validity Date\n";
  currentFilteredUsers.forEach(user => {
    const name = (user.name || "Unknown").replace(/,/g, ""); 
    const email = (user.email || "").replace(/,/g, "");
    
    // Extract the core subject from Firebase, defaulting to 'sanskrit' if blank
    const coreSubj = (user.coreSubject || "sanskrit").toUpperCase();
    
    const whatsapp = (user.whatsapp || "").replace(/,/g, "");
    const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : "Unknown";
    let status = (user.computedStatus === "vip") ? "Active Passes" : "Basic Access";

    let activeTags = [];
    const now = new Date();
    
    // Updated the array to check the new active passes (bengali, philosophy)
    ['general', 'sanskrit', 'bengali', 'philosophy', 'batch'].forEach(p => {
      if (user.passes && user.passes[p] && new Date(user.passes[p]) > now) {
        activeTags.push(`${p.toUpperCase()}: ${new Date(user.passes[p]).toLocaleDateString('en-IN')}`);
      }
    });
    const validity = activeTags.length > 0 ? activeTags.join(' | ') : "N/A";

    csvContent += `${name},${email},${coreSubj},${whatsapp},${joined},${status},${validity}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Sanskrit_Vartika_Students_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("✅ CSV Exported Successfully!");
}

// --- DEVELOPER SANDBOX ENGINE ---
async function setTestState(state) {
  if (!currentUser) return showToast("Error: Not logged in.");
  
  let updatedPasses = { batch: null, sanskrit: null, general: null, combo: null };
  let d = new Date();
  d.setDate(d.getDate() + 5); // Default 5 day trial for testing
  
  if (state === 'combo') updatedPasses.combo = d.toISOString();
  else if (state === 'batch') updatedPasses.batch = d.toISOString();
  else if (state === 'sanskrit') updatedPasses.sanskrit = d.toISOString();
  else if (state === 'general') updatedPasses.general = d.toISOString();
  else if (state === 'expired') {
    d.setDate(d.getDate() - 10); 
    updatedPasses.combo = d.toISOString();
  }
  
  try {
    await db.collection("users").doc(currentUser.uid).update({ 
      passes: updatedPasses,
      accessLevel: state === 'free' || state === 'expired' ? 'basic' : 'premium'
    });
    showToast(`✅ Admin Test State Applied: ${state.toUpperCase()}`);
    showToast(`Open the main website in a new tab to see the changes!`);
  } catch(error) {
    alert("Error changing test state: " + error.message);
  }
}

// ==========================================
// === GITHUB NOTIFICATIONS ENGINE ===
// ==========================================

let localNotifications = [];
let githubFileSHA = null; // Required by GitHub to update a file

// UTF-8 safe Base64 encoding/decoding
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

function openTokenVault() {
  const settings = JSON.parse(localStorage.getItem('vartika_github_api') || '{}');
  document.getElementById('github-repo-owner').value = settings.owner || '';
  document.getElementById('github-repo-name').value = settings.repo || '';
  document.getElementById('github-pat-token').value = settings.token || '';
  document.getElementById('github-token-modal').style.display = 'flex';
}

function saveGitHubToken() {
  const owner = document.getElementById('github-repo-owner').value.trim();
  const repo = document.getElementById('github-repo-name').value.trim();
  const token = document.getElementById('github-pat-token').value.trim();
  
  if (!owner || !repo || !token) return alert("All fields are required.");
  
  localStorage.setItem('vartika_github_api', JSON.stringify({ owner, repo, token }));
  document.getElementById('github-token-modal').style.display = 'none';
  showToast("✅ GitHub credentials secured in local vault.");
  
  fetchLiveNotifications(); // Auto-fetch once saved
}

async function fetchLiveNotifications() {
  const settings = JSON.parse(localStorage.getItem('vartika_github_api') || '{}');
  if (!settings.token) return;

  const btn = document.getElementById('github-sync-btn');
  btn.textContent = "Fetching...";
  
  try {
    const response = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/notifications.json`, {
      headers: { 'Authorization': `token ${settings.token}` }
    });
    
    if (response.status === 404) {
      showToast("File not found on GitHub. Initializing empty array.");
      localNotifications = [];
      renderAdminNotifications();
      return;
    }
    if (!response.ok) throw new Error("GitHub API Error: " + response.status);

    const data = await response.json();
    githubFileSHA = data.sha; // Save the SHA!
    
    const decodedContent = base64ToUtf8(data.content);
    localNotifications = JSON.parse(decodedContent);
    renderAdminNotifications();
    showToast("✅ Live notifications synced!");
  } catch (error) {
    alert("Failed to fetch from GitHub. Check your repo name and token.\n\n" + error.message);
  } finally {
    btn.innerHTML = "🚀 Push to Server";
  }
}

function renderAdminNotifications() {
  const feed = document.getElementById('admin-notif-feed');
  feed.innerHTML = '';
  
  if (localNotifications.length === 0) {
    feed.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 40px 0;">No active notifications.</p>';
    return;
  }

  // Define colors for priority tags
  const tagStyles = {
    'update': 'background: #E8F5E9; color: #2E7D32; border: 1px solid #C8E6C9;',
    'offer': 'background: #FFF3E0; color: #E65100; border: 1px solid #FFE0B2;',
    'alert': 'background: #FFEBEE; color: #C62828; border: 1px solid #FFCDD2;'
  };

  localNotifications.forEach((notif, index) => {
    const style = tagStyles[notif.type] || tagStyles['update'];
    const expiryTag = notif.expiresAt ? `<span style="font-size:0.75rem; color:#9E9E9E; margin-left:8px;">⏳ Expires: ${notif.expiresAt}</span>` : '';
    const targetTag = (notif.target && notif.target !== 'all') ? `<span style="font-size:0.7rem; background:#E3F2FD; color:#1565C0; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:bold; text-transform:uppercase;">🎯 ${notif.target} Only</span>` : '';
    
    feed.innerHTML += `
      <div style="background: white; border: 1px solid #eee; padding: 16px; border-radius: var(--radius-sm); position: relative;">
        <span style="position:absolute; top:12px; right:12px; font-size:0.7rem; padding:3px 8px; border-radius:50px; font-weight:bold; text-transform:uppercase; ${style}">${notif.type}</span>
        
        <h4 style="color: var(--brown); margin-bottom: 6px; padding-right: 60px;">${escapeHTML(notif.title)}</h4>
        <p style="font-size: 0.85rem; color: var(--text-mid); margin-bottom: 10px; white-space: pre-wrap;">${escapeHTML(notif.desc)}</p>
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f5f5f5; padding-top: 10px; margin-top: 10px;">
          <div>
            <span style="font-size:0.75rem; color:#A1887F;">📅 ${new Date(notif.id).toLocaleDateString('en-IN')}</span>
            ${expiryTag}
            ${targetTag}
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm" style="background: transparent; color: #1565C0; border: 1px solid #1565C0; padding: 4px 10px;" onclick="editNotificationLocally(${index})">Edit</button>
            <button class="btn btn-sm" style="background: transparent; color: #D32F2F; border: 1px solid #D32F2F; padding: 4px 10px;" onclick="deleteNotificationLocally(${index})">Delete</button>
          </div>
        </div>
      </div>
    `;
  });
}

function addNotificationLocally() {
  const title = document.getElementById('notif-title').value.trim();
  const desc = document.getElementById('notif-desc').value.trim();
  const type = document.getElementById('notif-type').value;
  const target = document.getElementById('notif-target').value;
  const expiresAt = document.getElementById('notif-expiry').value;
  const btnText = document.getElementById('notif-btn-text').value.trim();
  const btnLink = document.getElementById('notif-btn-link').value.trim();

  if (!title || !desc) return alert("Title and description are required!");

  const newNotif = {
    id: new Date().toISOString(), // Serves as both unique ID and Timestamp
    title, desc, type, target, expiresAt, btnText, btnLink
  };

  localNotifications.unshift(newNotif); // Add to the top
  renderAdminNotifications();
  
  // Clear the form
  document.getElementById('notif-title').value = '';
  document.getElementById('notif-desc').value = '';
  document.getElementById('notif-btn-text').value = '';
  document.getElementById('notif-btn-link').value = '';
  
  showToast("Added to drafts! Don't forget to push to server.");
}

function deleteNotificationLocally(index) {
  if (!confirm("Remove this notification?")) return;
  localNotifications.splice(index, 1);
  renderAdminNotifications();
  showToast("Removed from drafts. Push to server to apply.");
}

function editNotificationLocally(index) {
  const notif = localNotifications[index];
  
  // Fill the modal with the existing data
  document.getElementById('notif-edit-index').value = index;
  document.getElementById('edit-notif-type').value = notif.type || 'update';
  document.getElementById('edit-notif-target').value = notif.target || 'all';
  document.getElementById('edit-notif-title').value = notif.title || '';
  document.getElementById('edit-notif-desc').value = notif.desc || '';
  document.getElementById('edit-notif-expiry').value = notif.expiresAt || '';
  document.getElementById('edit-notif-btn-text').value = notif.btnText || '';
  document.getElementById('edit-notif-btn-link').value = notif.btnLink || '';
  
  // Show the modal
  document.getElementById('notif-edit-modal').style.display = 'flex';
}

function saveEditedNotification() {
  const index = document.getElementById('notif-edit-index').value;
  const title = document.getElementById('edit-notif-title').value.trim();
  const desc = document.getElementById('edit-notif-desc').value.trim();
  
  if (!title || !desc) return alert("Title and description are required!");

  // Save changes back to the array
  localNotifications[index].type = document.getElementById('edit-notif-type').value;
  localNotifications[index].target = document.getElementById('edit-notif-target').value;
  localNotifications[index].title = title;
  localNotifications[index].desc = desc;
  localNotifications[index].expiresAt = document.getElementById('edit-notif-expiry').value;
  localNotifications[index].btnText = document.getElementById('edit-notif-btn-text').value.trim();
  localNotifications[index].btnLink = document.getElementById('edit-notif-btn-link').value.trim();

  // Re-render and close
  renderAdminNotifications();
  document.getElementById('notif-edit-modal').style.display = 'none';
  showToast("✅ Updated in drafts! Push to server to apply changes.");
}

async function pushToGitHub() {
  const settings = JSON.parse(localStorage.getItem('vartika_github_api') || '{}');
  if (!settings.token) return openTokenVault();

  const btn = document.getElementById('github-sync-btn');
  btn.textContent = "Pushing...";
  btn.disabled = true;

  try {
    const jsonContent = JSON.stringify(localNotifications, null, 2);
    const base64Content = utf8ToBase64(jsonContent);

    const body = {
      message: `Admin Update: Syncing Notifications (${new Date().toISOString()})`,
      content: base64Content
    };
    if (githubFileSHA) body.sha = githubFileSHA; // Provide SHA if we are updating an existing file

    const response = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/notifications.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${settings.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error("GitHub API Error: " + response.status);

    const data = await response.json();
    githubFileSHA = data.content.sha; // Update the SHA with the newly created file's SHA
    showToast("✅ Successfully pushed to GitHub Server!");
    
  } catch (error) {
    alert("Failed to push changes.\n" + error.message);
  } finally {
    btn.innerHTML = "🚀 Push to Server";
    btn.disabled = false;
  }
}

function downloadBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localNotifications, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `vartika_notifications_backup_${new Date().toISOString().split('T')[0]}.json`);
  dlAnchorElem.click();
}


// ==========================================
// 📈 ZERO-COST ANALYTICS ENGINE
// ==========================================

let activityChartInstance = null;
let subjectChartInstance = null;
let demographicsChartInstance = null;

function loadAnalyticsEngine() {
  let totalStudents = currentFilteredUsers.length;
  let activeVIPs = 0, totalTests = 0;

  // Setup 14-day tracking dictionary
  let dailyActivity = {};
  for(let i=13; i>=0; i--) {
    let d = new Date(); d.setDate(d.getDate() - i);
    dailyActivity[d.toLocaleDateString('en-IN')] = 0;
  }

  let subjectCount = { 'Sanskrit (Paper 2)': 0, 'Bengali (Paper 2)': 0, 'Philosophy (Paper 2)': 0, 'General (Paper 1)': 0, 'Other Topics': 0 };
  let demoCount = { 'Sanskrit': 0, 'Bengali': 0, 'Philosophy': 0 };
  let activePassCounts = { general: 0, sanskrit: 0, bengali: 0, philosophy: 0, batch: 0 };

  // 🚀 THE CATEGORIZER DICTIONARIES
  const sktKeywords = ['sanskrit', 'paper 2', 'वैदिक', 'व्याकरण', 'दर्शन', 'साहित्य', 'अन्यानि'];
  const benKeywords = ['bengali', 'history of language', 'poetry', 'fiction', 'prose', 'drama', 'folk', 'rabindra', 'prosody', 'poetics'];
  const philKeywords = ['philosophy', 'classical indian', 'classical western', 'ethics', 'contemporary', 'recent', 'social', 'political', 'logic'];
  const p1Keywords = ['paper 1', '1st paper', 'teaching', 'research', 'comprehension', 'communication', 'mathematical', 'logical', 'data', 'ict', 'people', 'higher education'];

  // CRUNCH THE NUMBERS IN RAM (0 Firebase Reads!)
  currentFilteredUsers.forEach(user => {
    if (user.computedStatus === 'vip') activeVIPs++;

    // Demographics Breakdown
    const core = user.coreSubject || 'sanskrit';
    if (core === 'bengali') demoCount['Bengali']++;
    else if (core === 'philosophy') demoCount['Philosophy']++;
    else demoCount['Sanskrit']++;

    // Active Pass Tracking
    const now = new Date();
    ['general', 'sanskrit', 'bengali', 'philosophy', 'batch'].forEach(p => {
      if (user.passes && user.passes[p] && new Date(user.passes[p]) > now) {
        activePassCounts[p]++;
      }
    });

    if (user.history && Array.isArray(user.history)) {
      totalTests += user.history.length;
      user.history.forEach(test => {
        let testDate = test.date; 
        
        if (testDate && dailyActivity[testDate] !== undefined) {
            dailyActivity[testDate]++;
        } else if (test.timestamp) {
           let dObj = new Date(test.timestamp);
           if (!isNaN(dObj)) {
              let key = dObj.toLocaleDateString('en-IN');
              if (dailyActivity[key] !== undefined) dailyActivity[key]++;
           }
        }

        let tName = (test.name || "").toLowerCase();
        
        if (sktKeywords.some(keyword => tName.includes(keyword))) subjectCount['Sanskrit (Paper 2)']++;
        else if (benKeywords.some(keyword => tName.includes(keyword))) subjectCount['Bengali (Paper 2)']++;
        else if (philKeywords.some(keyword => tName.includes(keyword))) subjectCount['Philosophy (Paper 2)']++;
        else if (p1Keywords.some(keyword => tName.includes(keyword))) subjectCount['General (Paper 1)']++;
        else subjectCount['Other Topics']++;
      });
    }
  });

  // UPDATE UI CARDS
  document.getElementById('stat-total-students').textContent = totalStudents;
  document.getElementById('stat-active-vips').textContent = activeVIPs;
  document.getElementById('stat-total-tests').textContent = totalTests;
  document.getElementById('stat-avg-tests').textContent = totalStudents > 0 ? (totalTests / totalStudents).toFixed(1) : 0;
  
  const filterDropdown = document.getElementById('admin-filter-status');
  document.getElementById('stat-cohort-name').textContent = filterDropdown.options[filterDropdown.selectedIndex].text;

  // POPULATE ACTIVE PASS BREAKDOWN
  document.getElementById('stat-pass-breakdown').innerHTML = `
    <div style="background: #E8F5E9; color: #2E7D32; padding: 8px 16px; border-radius: 50px; font-size: 0.85rem; font-weight: bold;">Paper 1: ${activePassCounts.general}</div>
    <div style="background: #E3F2FD; color: #1565C0; padding: 8px 16px; border-radius: 50px; font-size: 0.85rem; font-weight: bold;">Sanskrit: ${activePassCounts.sanskrit}</div>
    <div style="background: #F3E5F5; color: #9C27B0; padding: 8px 16px; border-radius: 50px; font-size: 0.85rem; font-weight: bold;">Bengali: ${activePassCounts.bengali}</div>
    <div style="background: #E0F7FA; color: #00838F; padding: 8px 16px; border-radius: 50px; font-size: 0.85rem; font-weight: bold;">Philosophy: ${activePassCounts.philosophy}</div>
    <div style="background: #FFF3E0; color: #E65100; padding: 8px 16px; border-radius: 50px; font-size: 0.85rem; font-weight: bold;">Batch: ${activePassCounts.batch}</div>
  `;

  // RENDER LINE CHART
  const ctxActivity = document.getElementById('chart-activity').getContext('2d');
  if (activityChartInstance) activityChartInstance.destroy();
  activityChartInstance = new Chart(ctxActivity, {
    type: 'line',
    data: {
      labels: Object.keys(dailyActivity),
      datasets: [{
        label: 'Tests Taken', data: Object.values(dailyActivity),
        borderColor: '#FF6B00', backgroundColor: 'rgba(255, 107, 0, 0.1)',
        borderWidth: 2, pointBackgroundColor: '#FF6B00', fill: true, tension: 0.3
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  // RENDER SUBJECT CHART
  const ctxSubject = document.getElementById('chart-subject').getContext('2d');
  if (subjectChartInstance) subjectChartInstance.destroy();
  subjectChartInstance = new Chart(ctxSubject, {
    type: 'doughnut',
    data: {
      labels: Object.keys(subjectCount),
      datasets: [{ data: Object.values(subjectCount), backgroundColor: ['#1565C0', '#9C27B0', '#00838F', '#2E7D32', '#FF9800'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  // RENDER DEMOGRAPHICS CHART
  const ctxDemo = document.getElementById('chart-demographics').getContext('2d');
  if (demographicsChartInstance) demographicsChartInstance.destroy();
  demographicsChartInstance = new Chart(ctxDemo, {
    type: 'pie',
    data: {
      labels: Object.keys(demoCount),
      datasets: [{ data: Object.values(demoCount), backgroundColor: ['#1565C0', '#9C27B0', '#00838F'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

// ==========================================
// 📊 INDIVIDUAL STUDENT REPORT CARD
// ==========================================
function openAdminStats(uid) {
  const user = adminUserList.find(u => u.uid === uid);
  if (!user) return;

  document.getElementById('admin-stats-name').textContent = `${user.name} (${user.email})`;
  const history = user.history || [];
  document.getElementById('admin-stats-total').textContent = history.length;

  let totalScore = 0, scoredTests = 0, historyHTML = '';

  if (history.length === 0) {
    historyHTML = '<p style="color: var(--text-light); text-align: center; padding: 10px;">No tests taken yet.</p>';
  } else {
    // Show newest first
    const reversedHistory = [...history].reverse();
    reversedHistory.forEach(test => {
      let testDate = test.date || test.timestamp;
      let displayDate = testDate ? new Date(testDate).toLocaleDateString('en-IN') : 'Unknown Date';
      let scoreText = '';
      if (test.score !== undefined && test.totalQuestions && test.totalQuestions > 0) {
         let percent = Math.round((test.score / test.totalQuestions) * 100);
         totalScore += percent; scoredTests++;
         scoreText = `<span style="font-weight: bold; color: ${percent >= 70 ? '#4CAF50' : '#D32F2F'};">${test.score}/${test.totalQuestions} (${percent}%)</span>`;
      } else {
         scoreText = `<span style="color: #9E9E9E;">No Score</span>`;
      }
      historyHTML += `
        <div style="display: flex; justify-content: space-between; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #f5f5f5;">
          <div style="max-width: 65%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-dark);">
            ${escapeHTML(test.name || 'Mock Test')}
          </div>
          <div style="text-align: right; font-size: 0.8rem;">
            ${scoreText}<br><span style="color: var(--text-light); font-size: 0.7rem;">${displayDate}</span>
          </div>
        </div>`;
    });
  }
  document.getElementById('admin-stats-avg').textContent = (scoredTests > 0 ? Math.round(totalScore / scoredTests) : 0) + '%';
  document.getElementById('admin-stats-history').innerHTML = historyHTML;
  document.getElementById('admin-stats-modal').style.display = 'flex';
}

// Auto-fetch data when switching to specific tabs
const originalSwitchTab = switchTab;
switchTab = function(tabName) {
  originalSwitchTab(tabName);
  if (tabName === 'notifications' && !githubFileSHA) {
    fetchLiveNotifications();
  }
  if (tabName === 'analytics') {
    loadAnalyticsEngine(); 
  }
};