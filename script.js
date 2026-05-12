/* ══════════════════════════════════════
   TRACKPAY – script.js
   ══════════════════════════════════════ */

// ── STATE ──────────────────────────────
let members   = JSON.parse(localStorage.getItem('tp_members')   || '[]');
let expenses  = JSON.parse(localStorage.getItem('tp_expenses')  || '[]');
let settings  = JSON.parse(localStorage.getItem('tp_settings')  || '{}');
let attendance= JSON.parse(localStorage.getItem('tp_attendance')|| '{}');

let currentPage   = 'dashboard';
let memberFilter  = 'all';
let memberSearch  = '';
let deleteTarget  = null;
let deleteType    = null;
let amPayStatus   = 'paid';
let emPayStatus   = 'paid';
let mpPayType     = 'full';

let pieChartInst     = null;
let revenueChartInst = null;

// ── UTILS ──────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const today = () => new Date().toISOString().split('T')[0];
const fmtINR = n => '₹' + Number(n).toLocaleString('en-IN');
const fmtDate = s => { const d=new Date(s); return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); };
const initials = name => name.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + parseInt(months));
  return d.toISOString().split('T')[0];
}

function daysUntil(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const exp = new Date(dateStr); exp.setHours(0,0,0,0);
  return Math.round((exp - now) / 86400000);
}

function isExpired(m) { return daysUntil(m.expiryDate) < 0; }

function save() {
  localStorage.setItem('tp_members',    JSON.stringify(members));
  localStorage.setItem('tp_expenses',   JSON.stringify(expenses));
  localStorage.setItem('tp_settings',   JSON.stringify(settings));
  localStorage.setItem('tp_attendance', JSON.stringify(attendance));
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 2800);
}

// ── NAVIGATION ─────────────────────────
function goTo(page, extra) {
  currentPage = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bnav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');

  const titles = {dashboard:'Dashboard',members:'Members',attendance:'Attendance',expenses:'Expenses',reports:'Reports',settings:'Settings'};
  document.getElementById('pageTitle').textContent = titles[page] || page;

  if (extra?.filter) {
    memberFilter = extra.filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === extra.filter));
  }

  if (page === 'dashboard')  renderDashboard();
  if (page === 'members')    renderMembers();
  if (page === 'attendance') renderAttendance();
  if (page === 'expenses')   renderExpenses();
  if (page === 'settings')   loadSettings();
}

// Nav clicks
document.querySelectorAll('.nav-item, .bnav-item').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); goTo(el.dataset.page); });
});

// Stat cards → members filtered
document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', () => goTo(el.dataset.goto, { filter: el.dataset.filter }));
});

// ── DASHBOARD ──────────────────────────
function renderDashboard() {
  const total   = members.length;
  const active  = members.filter(m => !isExpired(m)).length;
  const expired = members.filter(m => isExpired(m)).length;
  const unpaid  = members.filter(m => m.paymentStatus === 'unpaid').length;

  // Monthly revenue: sum of paid members' fees joined this month
  const now = new Date();
  const monthRevenue = members
    .filter(m => m.paymentStatus === 'paid' && new Date(m.joinDate).getMonth() === now.getMonth() && new Date(m.joinDate).getFullYear() === now.getFullYear())
    .reduce((s, m) => s + Number(m.fee || 0), 0);

  document.getElementById('d-total').textContent   = total;
  document.getElementById('d-active').textContent  = active;
  document.getElementById('d-expired').textContent = expired;
  document.getElementById('d-unpaid').textContent  = unpaid;
  document.getElementById('d-revenue').textContent = fmtINR(monthRevenue);
  document.getElementById('heroActive').textContent = active;

  // Notification dot
  const dot = document.getElementById('notifDot');
  dot.style.display = (unpaid > 0 || expired > 0) ? 'block' : 'none';

  // Sidebar gym name
  const gymName = settings.gymName || 'My Gym';
  document.getElementById('sidebarGymName').textContent = gymName;
  document.getElementById('profileAvatar').textContent = gymName[0].toUpperCase();

  renderPieChart(active, expired, unpaid);
  renderRevenueChart();
  renderExpiringList();
}

function renderPieChart(active, expired, unpaid) {
  const ctx = document.getElementById('pieChart');
  if (!ctx) return;
  if (pieChartInst) pieChartInst.destroy();
  pieChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Active', 'Expired', 'Unpaid'],
      datasets: [{
        data: [active, expired, unpaid],
        backgroundColor: ['#22c55e','#ef4444','#eab308'],
        borderColor: '#141414', borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position:'bottom', labels:{ color:'#888', boxWidth:10, padding:12, font:{size:11, family:'Outfit'} } }
      },
      cutout: '65%'
    }
  });
}

function renderRevenueChart() {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  if (revenueChartInst) revenueChartInst.destroy();

  // Build last 6 months labels + revenue from members
  const months = [];
  const revenues = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lbl = d.toLocaleDateString('en-IN', { month:'short', year:'2-digit' });
    months.push(lbl);
    const rev = members
      .filter(m => {
        const jd = new Date(m.joinDate);
        return m.paymentStatus === 'paid' && jd.getMonth() === d.getMonth() && jd.getFullYear() === d.getFullYear();
      })
      .reduce((s, m) => s + Number(m.fee || 0), 0);
    revenues.push(rev);
  }

  revenueChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Revenue (₹)',
        data: revenues,
        backgroundColor: 'rgba(245,166,35,0.25)',
        borderColor: '#f5a623',
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(245,166,35,0.45)'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend:{ display:false } },
      scales: {
        x: { grid:{ color:'#222' }, ticks:{ color:'#888', font:{family:'Outfit', size:11} } },
        y: { grid:{ color:'#1e1e1e' }, ticks:{ color:'#888', font:{family:'Outfit', size:11}, callback: v => '₹'+v } }
      }
    }
  });
}

function renderExpiringList() {
  const reminderDays = parseInt(settings.reminderDays || 5);
  const expiring = members.filter(m => {
    const d = daysUntil(m.expiryDate);
    return d >= 0 && d <= reminderDays;
  }).sort((a,b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate));

  document.getElementById('expiringSoonBadge').textContent = expiring.length;
  const container = document.getElementById('expiringList');
  if (expiring.length === 0) {
    container.innerHTML = '<p class="empty-mini">No members expiring soon 🎉</p>';
    return;
  }
  container.innerHTML = expiring.map(m => {
    const d = daysUntil(m.expiryDate);
    const dLabel = d === 0 ? 'Today!' : `${d}d left`;
    return `<div class="expiring-item">
      <div>
        <div class="exp-item-name">${esc(m.name)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${esc(m.phone)}</div>
      </div>
      <div class="exp-item-days">${dLabel}</div>
      <button class="exp-item-wa" data-id="${m.id}">💬 WhatsApp</button>
    </div>`;
  }).join('');
}

document.getElementById('expiringList').addEventListener('click', e => {
  const btn = e.target.closest('.exp-item-wa');
  if (btn) openWhatsApp(btn.dataset.id);
});

// ── MEMBERS ────────────────────────────
function renderMembers() {
  let list = members.filter(m => {
    const s = memberSearch.toLowerCase();
    const match = m.name.toLowerCase().includes(s) || m.phone.includes(s);
    if (!match) return false;
    if (memberFilter === 'active')  return !isExpired(m);
    if (memberFilter === 'expired') return isExpired(m);
    if (memberFilter === 'unpaid')  return m.paymentStatus === 'unpaid';
    return true;
  });

  list.sort((a,b) => {
    if (a.paymentStatus==='unpaid' && b.paymentStatus!=='unpaid') return -1;
    if (b.paymentStatus==='unpaid' && a.paymentStatus!=='unpaid') return 1;
    return daysUntil(a.expiryDate) - daysUntil(b.expiryDate);
  });

  document.getElementById('memberCountLabel').textContent = `${list.length} member${list.length!==1?'s':''}`;

  const grid = document.getElementById('membersGrid');
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🏋️</div><p>No members found.</p></div>`;
    return;
  }
  grid.innerHTML = list.map(m => buildMemberCard(m)).join('');
}

function buildMemberCard(m) {
  const days    = daysUntil(m.expiryDate);
  const expired = days < 0;
  const soon    = !expired && days <= parseInt(settings.reminderDays || 5);

  let expiryVal, expiryClass;
  if (expired)    { expiryVal = `Expired ${Math.abs(days)}d ago`; expiryClass = 'expired-text'; }
  else if (soon)  { expiryVal = days === 0 ? 'Expires today!' : `${days}d left`; expiryClass = 'expiring-soon'; }
  else            { expiryVal = fmtDate(m.expiryDate); expiryClass = ''; }

  return `<div class="member-card ${expired?'card-expired':'card-active'}">
    <div class="card-top">
      <div class="member-avatar">${esc(initials(m.name))}</div>
      <div class="card-info">
        <div class="card-name">${esc(m.name)}</div>
        <div class="card-phone">📱 ${esc(m.phone)}</div>
      </div>
      <div class="card-badges">
        <span class="badge ${expired?'badge-expired':'badge-active'}">${expired?'Expired':'Active'}</span>
        <span class="badge ${m.paymentStatus==='paid'?'badge-paid':'badge-unpaid'}">${m.paymentStatus==='paid'?'Paid':'Unpaid'}</span>
      </div>
    </div>
    <div class="card-details">
      <div class="detail-item"><span class="detail-lbl">Joined</span><span class="detail-val">${fmtDate(m.joinDate)}</span></div>
      <div class="detail-item"><span class="detail-lbl">Expires</span><span class="detail-val ${expiryClass}">${expiryVal}</span></div>
      <div class="detail-item"><span class="detail-lbl">Plan</span><span class="detail-val">${esc(m.plan||m.duration+' Mo')}</span></div>
      <div class="detail-item"><span class="detail-lbl">Fee</span><span class="detail-val fee-val">${fmtINR(m.fee||0)}</span></div>
    </div>
    <div class="card-actions">
      <button class="card-btn btn-wa"   data-id="${m.id}">💬 WhatsApp</button>
      <button class="card-btn btn-pay"  data-id="${m.id}">${m.paymentStatus==='paid'?'❌ Unpaid':'✅ Paid'}</button>
      <button class="card-btn btn-edit" data-id="${m.id}">✏️ Edit</button>
      <button class="card-btn btn-del"  data-id="${m.id}">🗑️</button>
    </div>
  </div>`;
}

document.getElementById('membersGrid').addEventListener('click', e => {
  const btn = e.target.closest('.card-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('btn-wa'))   openWhatsApp(id);
  if (btn.classList.contains('btn-pay'))  togglePayment(id);
  if (btn.classList.contains('btn-edit')) openEditMember(id);
  if (btn.classList.contains('btn-del'))  openDeleteModal(id, 'member');
});

document.getElementById('memberSearch').addEventListener('input', e => {
  memberSearch = e.target.value.toLowerCase().trim();
  renderMembers();
});

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    memberFilter = tab.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === memberFilter));
    renderMembers();
  });
});

// ── ADD MEMBER ─────────────────────────
document.getElementById('openAddMember').addEventListener('click', () => {
  document.getElementById('am-join').value = today();
  document.getElementById('am-error').textContent = '';
  setAmPay('paid');
  openModal('modal-addMember');
});

document.getElementById('qa-addMember').addEventListener('click', () => {
  goTo('members');
  setTimeout(() => {
    document.getElementById('am-join').value = today();
    document.getElementById('am-error').textContent = '';
    setAmPay('paid');
    openModal('modal-addMember');
  }, 100);
});

function setAmPay(val) {
  amPayStatus = val;
  document.getElementById('am-paid').classList.toggle('active', val==='paid');
  document.getElementById('am-unpaid').classList.toggle('active', val==='unpaid');
}
document.getElementById('am-paid').addEventListener('click', () => setAmPay('paid'));
document.getElementById('am-unpaid').addEventListener('click', () => setAmPay('unpaid'));

document.getElementById('submitAddMember').addEventListener('click', () => {
  const name  = document.getElementById('am-name').value.trim();
  const phone = document.getElementById('am-phone').value.trim();
  const join  = document.getElementById('am-join').value;
  const dur   = document.getElementById('am-duration').value;
  const fee   = document.getElementById('am-fee').value.trim();
  const plan  = document.getElementById('am-plan').value.trim();
  const err   = document.getElementById('am-error');

  if (!name)  { err.textContent = 'Name is required.'; return; }
  if (!phone) { err.textContent = 'Phone is required.'; return; }
  if (!join)  { err.textContent = 'Join date is required.'; return; }
  if (!fee || isNaN(fee) || Number(fee) < 0) { err.textContent = 'Enter a valid fee.'; return; }

  members.unshift({
    id: uid(), name, phone, joinDate: join,
    duration: parseInt(dur),
    expiryDate: addMonths(join, dur),
    fee: Number(fee),
    plan: plan || dur + ' Month',
    paymentStatus: amPayStatus,
    createdAt: new Date().toISOString()
  });
  save();
  closeModal('modal-addMember');
  clearForm(['am-name','am-phone','am-fee','am-plan']);
  toast('✅ Member added!', 'success');
  renderMembers();
  renderDashboard();
});

// ── EDIT MEMBER ────────────────────────
function openEditMember(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  document.getElementById('em-id').value      = m.id;
  document.getElementById('em-name').value    = m.name;
  document.getElementById('em-phone').value   = m.phone;
  document.getElementById('em-join').value    = m.joinDate;
  document.getElementById('em-duration').value= m.duration;
  document.getElementById('em-fee').value     = m.fee;
  document.getElementById('em-plan').value    = m.plan || '';
  document.getElementById('em-error').textContent = '';
  setEmPay(m.paymentStatus);
  openModal('modal-editMember');
}

function setEmPay(val) {
  emPayStatus = val;
  document.getElementById('em-paid').classList.toggle('active', val==='paid');
  document.getElementById('em-unpaid').classList.toggle('active', val==='unpaid');
}
document.getElementById('em-paid').addEventListener('click', () => setEmPay('paid'));
document.getElementById('em-unpaid').addEventListener('click', () => setEmPay('unpaid'));

document.getElementById('submitEditMember').addEventListener('click', () => {
  const id    = document.getElementById('em-id').value;
  const name  = document.getElementById('em-name').value.trim();
  const phone = document.getElementById('em-phone').value.trim();
  const join  = document.getElementById('em-join').value;
  const dur   = document.getElementById('em-duration').value;
  const fee   = document.getElementById('em-fee').value.trim();
  const plan  = document.getElementById('em-plan').value.trim();
  const err   = document.getElementById('em-error');

  if (!name)  { err.textContent = 'Name is required.'; return; }
  if (!phone) { err.textContent = 'Phone is required.'; return; }
  if (!fee || isNaN(fee)) { err.textContent = 'Enter a valid fee.'; return; }

  const idx = members.findIndex(x => x.id === id);
  if (idx === -1) return;
  members[idx] = { ...members[idx], name, phone, joinDate: join, duration: parseInt(dur), expiryDate: addMonths(join, dur), fee: Number(fee), plan: plan||dur+' Month', paymentStatus: emPayStatus };
  save();
  closeModal('modal-editMember');
  toast('✏️ Member updated!', 'success');
  renderMembers();
  renderDashboard();
});

// ── TOGGLE PAYMENT ─────────────────────
function togglePayment(id) {
  const idx = members.findIndex(m => m.id === id);
  if (idx === -1) return;
  members[idx].paymentStatus = members[idx].paymentStatus === 'paid' ? 'unpaid' : 'paid';
  save();
  renderMembers();
  renderDashboard();
  toast(members[idx].paymentStatus === 'paid' ? '✅ Marked as Paid' : '❌ Marked as Unpaid');
}

// ── MARK PAYMENT MODAL ─────────────────
function openMarkPaymentModal() {
  const sel = document.getElementById('mp-member');
  sel.innerHTML = members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  document.getElementById('mp-date').value = today();
  document.getElementById('mp-amount').value = '';
  setMpType('full');
  openModal('modal-markPayment');
}

function setMpType(val) {
  mpPayType = val;
  document.getElementById('mp-full').classList.toggle('active', val==='full');
  document.getElementById('mp-partial').classList.toggle('active', val==='partial');
}
document.getElementById('mp-full').addEventListener('click', () => setMpType('full'));
document.getElementById('mp-partial').addEventListener('click', () => setMpType('partial'));

document.getElementById('qa-markPayment').addEventListener('click', openMarkPaymentModal);

document.getElementById('submitMarkPayment').addEventListener('click', () => {
  const id  = document.getElementById('mp-member').value;
  const amt = document.getElementById('mp-amount').value;
  const idx = members.findIndex(m => m.id === id);
  if (idx === -1) return;
  if (mpPayType === 'full') {
    members[idx].paymentStatus = 'paid';
    if (amt) members[idx].fee = Number(amt);
  }
  save();
  closeModal('modal-markPayment');
  toast('💳 Payment recorded!', 'success');
  renderMembers();
  renderDashboard();
});

// ── WHATSAPP ───────────────────────────
function openWhatsApp(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  const days = daysUntil(m.expiryDate);
  let msg;
  if (days < 0)
    msg = `Hi ${m.name}! 👋\n\nYour gym membership expired ${Math.abs(days)} day(s) ago.\nPlease renew to continue. 💪\n\n– ${settings.gymName||'Your Gym'}`;
  else if (days <= 5)
    msg = `Hi ${m.name}! 👋\n\nYour gym membership expires in ${days} day(s) (${fmtDate(m.expiryDate)}).\nRenew soon to avoid any break. 💪\n\n– ${settings.gymName||'Your Gym'}`;
  else
    msg = `Hi ${m.name}! 👋\n\nYour gym membership is active till ${fmtDate(m.expiryDate)}.\nKeep it up! 💪\n\n– ${settings.gymName||'Your Gym'}`;

  const phone = m.phone.replace(/\D/g,'');
  window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── BULK REMINDER ──────────────────────
document.getElementById('qa-reminder').addEventListener('click', () => {
  const reminderDays = parseInt(settings.reminderDays||5);
  const targets = members.filter(m => {
    const d = daysUntil(m.expiryDate);
    return d >= 0 && d <= reminderDays;
  });
  if (targets.length === 0) { toast('No members expiring soon.'); return; }
  targets.forEach((m,i) => setTimeout(() => openWhatsApp(m.id), i*500));
  toast(`💬 Opening ${targets.length} reminder(s)…`);
});

// Quick actions → pages
document.getElementById('qa-attendance').addEventListener('click', () => goTo('attendance'));
document.getElementById('qa-reports').addEventListener('click', () => goTo('reports'));
document.getElementById('qa-backup').addEventListener('click', backupData);

// ── DELETE MODAL ───────────────────────
function openDeleteModal(id, type) {
  deleteTarget = id;
  deleteType   = type;
  const m = type==='member' ? members.find(x=>x.id===id) : expenses.find(x=>x.id===id);
  document.getElementById('deleteConfirmText').textContent = `Delete "${m?.name||m?.desc}"? This cannot be undone.`;
  openModal('modal-delete');
}

document.getElementById('confirmDelete').addEventListener('click', () => {
  if (deleteType === 'member') {
    members = members.filter(m => m.id !== deleteTarget);
    save(); renderMembers(); renderDashboard();
    toast('🗑️ Member deleted.', 'error');
  } else if (deleteType === 'expense') {
    expenses = expenses.filter(e => e.id !== deleteTarget);
    save(); renderExpenses(); renderDashboard();
    toast('🗑️ Expense deleted.', 'error');
  }
  deleteTarget = deleteType = null;
  closeModal('modal-delete');
});

// ── ATTENDANCE ─────────────────────────
function renderAttendance() {
  const d = new Date();
  const dateKey = today();
  document.getElementById('attendDate').textContent = d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const todayAtt = attendance[dateKey] || {};
  const present = Object.values(todayAtt).filter(v=>v==='present').length;
  const absent  = Object.values(todayAtt).filter(v=>v==='absent').length;
  document.getElementById('attendSummary').textContent = `Present: ${present} | Absent: ${absent}`;

  const container = document.getElementById('attendList');
  const active = members.filter(m => !isExpired(m));
  if (active.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No active members to mark.</p></div>`;
    return;
  }
  container.innerHTML = active.map(m => {
    const status = todayAtt[m.id] || '';
    return `<div class="attend-item">
      <div class="attend-avatar">${esc(initials(m.name))}</div>
      <div class="attend-name">${esc(m.name)}</div>
      <div class="attend-toggle">
        <button class="attn-btn ${status==='present'?'present':'inactive'}" data-id="${m.id}" data-val="present">✅ Present</button>
        <button class="attn-btn ${status==='absent'?'absent':'inactive'}" data-id="${m.id}" data-val="absent">❌ Absent</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('attendList').addEventListener('click', e => {
  const btn = e.target.closest('.attn-btn');
  if (!btn) return;
  const id  = btn.dataset.id;
  const val = btn.dataset.val;
  const dateKey = today();
  if (!attendance[dateKey]) attendance[dateKey] = {};
  attendance[dateKey][id] = val;
  save();
  renderAttendance();
});

// ── EXPENSES ───────────────────────────
document.getElementById('openAddExpense').addEventListener('click', () => {
  document.getElementById('exp-date').value = today();
  document.getElementById('exp-error').textContent = '';
  openModal('modal-addExpense');
});

document.getElementById('submitAddExpense').addEventListener('click', () => {
  const desc = document.getElementById('exp-desc').value.trim();
  const amt  = document.getElementById('exp-amount').value.trim();
  const date = document.getElementById('exp-date').value;
  const cat  = document.getElementById('exp-category').value;
  const err  = document.getElementById('exp-error');

  if (!desc) { err.textContent = 'Description is required.'; return; }
  if (!amt || isNaN(amt) || Number(amt) <= 0) { err.textContent = 'Enter a valid amount.'; return; }

  expenses.unshift({ id: uid(), desc, amount: Number(amt), date: date||today(), category: cat });
  save();
  closeModal('modal-addExpense');
  clearForm(['exp-desc','exp-amount']);
  toast('💸 Expense added!', 'success');
  renderExpenses();
});

function renderExpenses() {
  const now = new Date();
  const thisMonthExp = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  }).reduce((s,e) => s+e.amount, 0);

  const totalExp = expenses.reduce((s,e) => s+e.amount, 0);

  document.getElementById('expThisMonth').textContent = fmtINR(thisMonthExp);
  document.getElementById('expTotal').textContent     = fmtINR(totalExp);

  const container = document.getElementById('expenseList');
  if (expenses.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">💸</div><p>No expenses yet.</p></div>`;
    return;
  }
  container.innerHTML = expenses.map(e => `
    <div class="expense-item">
      <span class="exp-cat-badge">${esc(e.category)}</span>
      <div class="exp-info">
        <div class="exp-desc">${esc(e.desc)}</div>
        <div class="exp-date">${fmtDate(e.date)}</div>
      </div>
      <div class="exp-amount">-${fmtINR(e.amount)}</div>
      <button class="exp-del" data-id="${e.id}">🗑️</button>
    </div>`).join('');
}

document.getElementById('expenseList').addEventListener('click', e => {
  const btn = e.target.closest('.exp-del');
  if (btn) openDeleteModal(btn.dataset.id, 'expense');
});

// ── REPORTS & BACKUP ───────────────────
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('rpt-members').querySelector('button').addEventListener('click', () => {
  const rows = [['Name','Phone','Join Date','Expiry','Plan','Fee','Status']];
  members.forEach(m => rows.push([m.name, m.phone, m.joinDate, m.expiryDate, m.plan||m.duration+' Mo', m.fee, m.paymentStatus]));
  downloadCSV('members.csv', rows);
  toast('📥 Downloaded members report');
});

document.getElementById('rpt-payments').querySelector('button').addEventListener('click', () => {
  const rows = [['Name','Phone','Fee','Payment Status','Expiry']];
  members.forEach(m => rows.push([m.name, m.phone, m.fee, m.paymentStatus, m.expiryDate]));
  downloadCSV('payments.csv', rows);
  toast('📥 Downloaded payment report');
});

document.getElementById('rpt-expired').querySelector('button').addEventListener('click', () => {
  const exp = members.filter(m => isExpired(m));
  const rows = [['Name','Phone','Expiry','Fee','Payment']];
  exp.forEach(m => rows.push([m.name, m.phone, m.expiryDate, m.fee, m.paymentStatus]));
  downloadCSV('expired_members.csv', rows);
  toast('📥 Downloaded expired report');
});

document.getElementById('rpt-expenses').querySelector('button').addEventListener('click', () => {
  const rows = [['Description','Category','Amount','Date']];
  expenses.forEach(e => rows.push([e.desc, e.category, e.amount, e.date]));
  downloadCSV('expenses.csv', rows);
  toast('📥 Downloaded expense report');
});

function backupData() {
  const data = { members, expenses, settings, attendance, backupDate: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `trackpay_backup_${today()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('☁️ Backup downloaded!', 'success');
}

document.getElementById('rpt-backup').querySelector('button').addEventListener('click', backupData);

document.getElementById('triggerRestore').addEventListener('click', () => {
  document.getElementById('restoreFile').click();
});

document.getElementById('restoreFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.members) members = data.members;
      if (data.expenses) expenses = data.expenses;
      if (data.settings) settings = data.settings;
      if (data.attendance) attendance = data.attendance;
      save();
      toast('♻️ Data restored!', 'success');
      renderDashboard();
    } catch { toast('❌ Invalid backup file.', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ── SETTINGS ───────────────────────────
function loadSettings() {
  document.getElementById('s-gymName').value      = settings.gymName || '';
  document.getElementById('s-ownerName').value    = settings.ownerName || '';
  document.getElementById('s-phone').value        = settings.phone || '';
  document.getElementById('s-defaultDur').value   = settings.defaultDur || '1';
  document.getElementById('s-reminderDays').value = settings.reminderDays || '5';
}

document.getElementById('saveSettings').addEventListener('click', () => {
  settings.gymName      = document.getElementById('s-gymName').value.trim();
  settings.ownerName    = document.getElementById('s-ownerName').value.trim();
  settings.phone        = document.getElementById('s-phone').value.trim();
  settings.defaultDur   = document.getElementById('s-defaultDur').value;
  settings.reminderDays = document.getElementById('s-reminderDays').value;
  save();
  toast('⚙️ Settings saved!', 'success');
  document.getElementById('sidebarGymName').textContent = settings.gymName || 'My Gym';
  if (settings.gymName) document.getElementById('profileAvatar').textContent = settings.gymName[0].toUpperCase();
});

document.getElementById('clearAllData').addEventListener('click', () => {
  if (!confirm('Are you sure? This will delete ALL data permanently.')) return;
  members=[]; expenses=[]; attendance={};
  save(); renderDashboard(); renderMembers(); renderExpenses();
  toast('🗑️ All data cleared.', 'error');
});

// ── MODAL UTILS ────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', () => closeModal(el.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
});

function clearForm(ids) { ids.forEach(id => document.getElementById(id).value = ''); }

// ── INIT ───────────────────────────────
document.getElementById('am-join').value = today();
renderDashboard();
