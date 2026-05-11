// ===== STATE =====
let members = JSON.parse(localStorage.getItem('gymMembers') || '[]');
let currentFilter = 'all';
let currentSearch = '';
let deleteTargetId = null;
let addPaymentStatus = 'paid';
let editPaymentStatus = 'paid';

// ===== HELPERS =====
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + parseInt(months));
  return d.toISOString().split('T')[0];
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysUntil(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const exp = new Date(dateStr); exp.setHours(0,0,0,0);
  return Math.round((exp - now) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isExpired(member) {
  return daysUntil(member.expiryDate) < 0;
}

function saveMembers() {
  localStorage.setItem('gymMembers', JSON.stringify(members));
}

// ===== RENDER =====
function renderMembers() {
  const list = document.getElementById('memberList');
  const empty = document.getElementById('emptyState');

  let filtered = members.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(currentSearch) ||
                        m.phone.includes(currentSearch);
    if (!matchSearch) return false;
    if (currentFilter === 'active')  return !isExpired(m);
    if (currentFilter === 'expired') return isExpired(m);
    if (currentFilter === 'unpaid')  return m.paymentStatus === 'unpaid';
    return true;
  });

  // Remove existing cards (keep emptyState)
  Array.from(list.querySelectorAll('.member-card')).forEach(el => el.remove());

  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // Sort: unpaid first, then expiring soonest
  filtered.sort((a, b) => {
    if (a.paymentStatus === 'unpaid' && b.paymentStatus !== 'unpaid') return -1;
    if (b.paymentStatus === 'unpaid' && a.paymentStatus !== 'unpaid') return 1;
    return daysUntil(a.expiryDate) - daysUntil(b.expiryDate);
  });

  filtered.forEach(m => {
    const card = buildCard(m);
    list.appendChild(card);
  });
}

function buildCard(m) {
  const days = daysUntil(m.expiryDate);
  const expired = days < 0;
  const expiringSoon = !expired && days <= 5;

  let expiryDisplay, expiryClass;
  if (expired) {
    expiryDisplay = `Expired ${Math.abs(days)}d ago`;
    expiryClass = 'expired-text';
  } else if (expiringSoon) {
    expiryDisplay = days === 0 ? 'Expires today!' : `Expires in ${days}d`;
    expiryClass = 'expiring-soon';
  } else {
    expiryDisplay = formatDate(m.expiryDate);
    expiryClass = '';
  }

  const card = document.createElement('div');
  card.className = `member-card ${expired ? 'expired-card' : 'active-card'}`;
  card.dataset.id = m.id;

  card.innerHTML = `
    <div class="card-top">
      <div class="member-info">
        <div class="member-name">${escapeHtml(m.name)}</div>
        <div class="member-phone">📱 ${escapeHtml(m.phone)}</div>
      </div>
      <div class="badges">
        <span class="badge ${expired ? 'badge-expired' : 'badge-active'}">${expired ? 'Expired' : 'Active'}</span>
        <span class="badge ${m.paymentStatus === 'paid' ? 'badge-paid' : 'badge-unpaid'}">${m.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</span>
      </div>
    </div>
    <div class="card-details">
      <div class="detail-item">
        <span class="detail-label">Joined</span>
        <span class="detail-value">${formatDate(m.joinDate)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Expiry</span>
        <span class="detail-value ${expiryClass}">${expiryDisplay}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Plan</span>
        <span class="detail-value">${m.duration} Month${m.duration > 1 ? 's' : ''}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Fee</span>
        <span class="detail-value fee-text">₹${Number(m.fee).toLocaleString('en-IN')}</span>
      </div>
    </div>
    <div class="card-actions">
      <button class="card-btn whatsapp" data-id="${m.id}">💬 WhatsApp</button>
      <button class="card-btn mark-paid" data-id="${m.id}">${m.paymentStatus === 'paid' ? '❌ Unpaid' : '✅ Paid'}</button>
      <button class="card-btn edit" data-id="${m.id}">✏️ Edit</button>
      <button class="card-btn delete" data-id="${m.id}">🗑️</button>
    </div>
  `;
  return card;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== STATS =====
function updateStats() {
  const total   = members.length;
  const active  = members.filter(m => !isExpired(m)).length;
  const expired = members.filter(m => isExpired(m)).length;
  const unpaid  = members.filter(m => m.paymentStatus === 'unpaid').length;
  document.getElementById('totalCount').textContent   = total;
  document.getElementById('activeCount').textContent  = active;
  document.getElementById('expiredCount').textContent = expired;
  document.getElementById('unpaidCount').textContent  = unpaid;
}

function refresh() {
  updateStats();
  renderMembers();
}

// ===== ADD MEMBER =====
document.getElementById('openAddModal').addEventListener('click', () => {
  document.getElementById('memberJoinDate').value = today();
  document.getElementById('formError').textContent = '';
  openModal('addModal');
});

document.getElementById('closeAddModal').addEventListener('click', () => closeModal('addModal'));

// Payment toggle (add form)
document.getElementById('togglePaid').addEventListener('click', () => setAddPayment('paid'));
document.getElementById('toggleUnpaid').addEventListener('click', () => setAddPayment('unpaid'));

function setAddPayment(val) {
  addPaymentStatus = val;
  document.getElementById('togglePaid').classList.toggle('active', val === 'paid');
  document.getElementById('toggleUnpaid').classList.toggle('active', val === 'unpaid');
}

document.getElementById('submitMember').addEventListener('click', () => {
  const name  = document.getElementById('memberName').value.trim();
  const phone = document.getElementById('memberPhone').value.trim();
  const join  = document.getElementById('memberJoinDate').value;
  const dur   = document.getElementById('memberDuration').value;
  const fee   = document.getElementById('memberFee').value.trim();
  const err   = document.getElementById('formError');

  if (!name)  { err.textContent = 'Name is required.'; return; }
  if (!phone) { err.textContent = 'Phone is required.'; return; }
  if (!join)  { err.textContent = 'Join date is required.'; return; }
  if (!fee || isNaN(fee) || Number(fee) < 0) { err.textContent = 'Enter a valid fee amount.'; return; }

  const member = {
    id: generateId(),
    name, phone,
    joinDate: join,
    duration: parseInt(dur),
    expiryDate: addMonths(join, dur),
    fee: Number(fee),
    paymentStatus: addPaymentStatus,
    createdAt: new Date().toISOString()
  };
  members.unshift(member);
  saveMembers();
  refresh();
  closeModal('addModal');
  clearAddForm();
});

function clearAddForm() {
  document.getElementById('memberName').value = '';
  document.getElementById('memberPhone').value = '';
  document.getElementById('memberFee').value = '';
  document.getElementById('memberDuration').value = '1';
  document.getElementById('memberJoinDate').value = today();
  document.getElementById('formError').textContent = '';
  setAddPayment('paid');
}

// ===== EDIT MEMBER =====
document.getElementById('closeEditModal').addEventListener('click', () => closeModal('editModal'));

document.getElementById('editTogglePaid').addEventListener('click', () => setEditPayment('paid'));
document.getElementById('editToggleUnpaid').addEventListener('click', () => setEditPayment('unpaid'));

function setEditPayment(val) {
  editPaymentStatus = val;
  document.getElementById('editTogglePaid').classList.toggle('active', val === 'paid');
  document.getElementById('editToggleUnpaid').classList.toggle('active', val === 'unpaid');
}

function openEditModal(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  document.getElementById('editMemberId').value      = m.id;
  document.getElementById('editMemberName').value    = m.name;
  document.getElementById('editMemberPhone').value   = m.phone;
  document.getElementById('editMemberJoinDate').value= m.joinDate;
  document.getElementById('editMemberDuration').value= m.duration;
  document.getElementById('editMemberFee').value     = m.fee;
  document.getElementById('editFormError').textContent = '';
  setEditPayment(m.paymentStatus);
  openModal('editModal');
}

document.getElementById('submitEditMember').addEventListener('click', () => {
  const id    = document.getElementById('editMemberId').value;
  const name  = document.getElementById('editMemberName').value.trim();
  const phone = document.getElementById('editMemberPhone').value.trim();
  const join  = document.getElementById('editMemberJoinDate').value;
  const dur   = document.getElementById('editMemberDuration').value;
  const fee   = document.getElementById('editMemberFee').value.trim();
  const err   = document.getElementById('editFormError');

  if (!name)  { err.textContent = 'Name is required.'; return; }
  if (!phone) { err.textContent = 'Phone is required.'; return; }
  if (!join)  { err.textContent = 'Join date is required.'; return; }
  if (!fee || isNaN(fee) || Number(fee) < 0) { err.textContent = 'Enter a valid fee amount.'; return; }

  const idx = members.findIndex(x => x.id === id);
  if (idx === -1) return;
  members[idx] = {
    ...members[idx], name, phone,
    joinDate: join,
    duration: parseInt(dur),
    expiryDate: addMonths(join, dur),
    fee: Number(fee),
    paymentStatus: editPaymentStatus
  };
  saveMembers();
  refresh();
  closeModal('editModal');
});

// ===== DELETE =====
document.getElementById('closeDeleteModal').addEventListener('click', () => closeModal('deleteModal'));
document.getElementById('cancelDelete').addEventListener('click', () => closeModal('deleteModal'));

document.getElementById('confirmDelete').addEventListener('click', () => {
  if (!deleteTargetId) return;
  members = members.filter(m => m.id !== deleteTargetId);
  deleteTargetId = null;
  saveMembers();
  refresh();
  closeModal('deleteModal');
});

function openDeleteModal(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  deleteTargetId = id;
  document.getElementById('deleteConfirmText').textContent =
    `Delete "${m.name}"? This cannot be undone.`;
  openModal('deleteModal');
}

// ===== WHATSAPP =====
function openWhatsApp(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  const days = daysUntil(m.expiryDate);
  let msg;
  if (days < 0) {
    msg = `Hi ${m.name}! 👋\n\nYour gym membership has expired ${Math.abs(days)} day(s) ago.\nPlease renew to continue your fitness journey. 💪\n\n— GymTrack`;
  } else if (days <= 5) {
    msg = `Hi ${m.name}! 👋\n\nYour gym membership expires in ${days} day(s) (on ${formatDate(m.expiryDate)}).\nPlease renew soon to avoid a break. 💪\n\n— GymTrack`;
  } else {
    msg = `Hi ${m.name}! 👋\n\nYour gym membership is active until ${formatDate(m.expiryDate)}.\nKeep up the great work! 💪\n\n— GymTrack`;
  }
  const phone = m.phone.replace(/\D/g, '');
  const url = `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ===== TOGGLE PAYMENT =====
function togglePayment(id) {
  const idx = members.findIndex(m => m.id === id);
  if (idx === -1) return;
  members[idx].paymentStatus = members[idx].paymentStatus === 'paid' ? 'unpaid' : 'paid';
  saveMembers();
  refresh();
}

// ===== EVENT DELEGATION (card buttons) =====
document.getElementById('memberList').addEventListener('click', (e) => {
  const btn = e.target.closest('.card-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('whatsapp'))  openWhatsApp(id);
  if (btn.classList.contains('mark-paid')) togglePayment(id);
  if (btn.classList.contains('edit'))      openEditModal(id);
  if (btn.classList.contains('delete'))    openDeleteModal(id);
});

// ===== STAT CARD FILTER SHORTCUTS =====
document.getElementById('stat-active').addEventListener('click', () => setFilter('active'));
document.getElementById('stat-expired').addEventListener('click', () => setFilter('expired'));
document.getElementById('stat-unpaid').addEventListener('click', () => setFilter('unpaid'));
document.getElementById('stat-total').addEventListener('click', () => setFilter('all'));

// ===== SEARCH =====
document.getElementById('searchInput').addEventListener('input', (e) => {
  currentSearch = e.target.value.toLowerCase().trim();
  renderMembers();
});

// ===== FILTER TABS =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => setFilter(tab.dataset.filter));
});

function setFilter(val) {
  currentFilter = val;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === val);
  });
  renderMembers();
}

// ===== MODAL UTILS =====
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
});

// ===== INIT =====
document.getElementById('memberJoinDate').value = today();
refresh();
