const STORAGE_KEY = 'quickos-groupe-v1';
const palette = ['#d99b75', '#81966e', '#b88491', '#8099ad', '#c39a5d', '#8d83ad', '#719a8b'];
const categories = { apero: 'Apéro', diner: 'Dîner', sortie: 'Sortie', anniversaire: 'Anniversaire', autre: 'Moment sympa' };
const categoryEmojis = { apero: '🍷', diner: '🍝', sortie: '🎟️', anniversaire: '🎂', autre: '✨' };
const today = new Date();
const dateAtOffset = (offset) => { const date = new Date(); date.setDate(date.getDate() + offset); return localDate(date); };
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const initialData = () => ({
  members: ['Léa', 'Max', 'Camille', 'Thomas'].map((name, index) => ({ id: `m${index + 1}`, name, color: palette[index] })),
  events: [
    { id: 'e1', title: 'Dîner chez Léa', date: dateAtOffset(3), time: '19:30', place: 'Chez Léa', category: 'diner' },
    { id: 'e2', title: 'Apéro du vendredi', date: dateAtOffset(7), time: '18:30', place: 'Le petit bar', category: 'apero' },
    { id: 'e3', title: 'Marché de Noël 🎄', date: dateAtOffset(13), time: '14:00', place: 'Centre-ville', category: 'sortie' },
  ],
  draw: null,
});
function readData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.members) && Array.isArray(saved.events)) return { ...initialData(), ...saved };
  } catch (error) { console.warn('Les données Quickos n’ont pas pu être lues.', error); }
  return initialData();
}
let data = readData();
let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let toastTimer;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const memberById = (id) => data.members.find((member) => member.id === id);
function avatar(member, extra = '') {
  return `<span class="friend-avatar ${extra}" style="background:${esc(member.color)}" aria-label="${esc(member.name)}">${esc(initials(member.name))}</span>`;
}
function formatDate(dateString, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('fr-FR', options).format(new Date(`${dateString}T12:00:00`));
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}
function updateHeader() {
  $('#event-count').textContent = data.events.length;
  $('#member-count').textContent = `${data.members.length} membre${data.members.length > 1 ? 's' : ''}`;
  $('#members-stack').innerHTML = data.members.slice(0, 3).map((member) => avatar(member, 'mini-avatar')).join('');
  $('#today-label').textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(today).toUpperCase();
  $('#friend-avatars').innerHTML = data.members.map((member) => avatar(member)).join('');
}
function eventMarkup(event) {
  const date = new Date(`${event.date}T12:00:00`);
  const day = new Intl.DateTimeFormat('fr-FR', { day: '2-digit' }).format(date);
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date).replace('.', '');
  const details = [event.time, event.place].filter(Boolean).map(esc).join(' · ');
  return `<article class="event-row"><div class="date-chip"><span>${esc(month)}</span><strong>${day}</strong></div><div class="event-info"><strong>${esc(event.title)}</strong><span>${details || 'On se retrouve !'}</span></div><span class="event-tag">${categoryEmojis[event.category] || '✨'} ${categories[event.category] || 'Moment sympa'}</span></article>`;
}
function renderHome() {
  const events = [...data.events].filter((event) => event.date >= localDate(today)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  $('#upcoming-events').innerHTML = events.length ? events.slice(0, 4).map(eventMarkup).join('') : '<div class="empty-state"><span>☀</span>Rien de prévu pour le moment.<br />Le premier qui propose a gagné !</div>';
  const next = events[0];
  if (next) {
    $('#hero-title').textContent = next.title;
    $('#hero-description').textContent = `${formatDate(next.date, { weekday: 'long', day: 'numeric', month: 'long' })}${next.time ? ` à ${next.time}` : ''}${next.place ? ` · ${next.place}` : ''}`;
  } else {
    $('#hero-title').textContent = 'On se retrouve bientôt ?';
    $('#hero-description').textContent = 'Ajoutez un événement pour retrouver tout le monde.';
  }
  $('#santa-home-copy').textContent = data.draw ? 'Le tirage est fait ! Chacun peut découvrir son destinataire à tour de rôle.' : 'Le tirage au sort est prêt à commencer. Qui va gâter qui cette année ?';
  $('#santa-home-button').innerHTML = data.draw ? 'Découvrir le tirage <span>→</span>' : 'Préparer le tirage <span>→</span>';
}
function renderCalendar() {
  const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
  $('#month-title').textContent = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);
  const headers = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  let html = headers.map((label) => `<div class="weekday">${label}</div>`).join('');
  for (let index = 0; index < 42; index++) {
    const day = new Date(start); day.setDate(start.getDate() + index);
    const date = localDate(day); const outside = day.getMonth() !== month;
    const items = data.events.filter((event) => event.date === date).slice(0, 2);
    html += `<div class="calendar-day${outside ? ' outside' : ''}${date === localDate(today) ? ' today' : ''}"><span class="day-number">${day.getDate()}</span>${items.map((event) => `<span class="calendar-event ${esc(event.category)}" title="${esc(event.title)}">${esc(event.title)}</span>`).join('')}</div>`;
  }
  $('#calendar-grid').innerHTML = html;
  const upcoming = [...data.events].filter((event) => event.date >= localDate(today)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  $('#calendar-event-list').innerHTML = upcoming.length ? upcoming.map(eventMarkup).join('') : '<div class="empty-state">Aucun rendez-vous à venir. Ajoutez le premier !</div>';
}
function renderMembers() {
  const people = data.members.length;
  $('#santa-member-count').textContent = `${people} participant${people !== 1 ? 's' : ''}`;
  $('#santa-members').innerHTML = data.members.map((member) => `<div class="santa-member">${avatar(member)}<strong>${esc(member.name)}</strong></div>`).join('');
  $('#participant-list').innerHTML = data.members.map((member) => {
    const revealed = Boolean(data.draw?.revealed?.includes(member.id));
    return `<div class="participant">${avatar(member)}<span class="participant-name">${esc(member.name)}</span>${data.draw ? `<button class="participant-state ${revealed ? 'done' : ''}" data-reveal="${esc(member.id)}">${revealed ? 'Vu ✓' : 'Révéler'}</button>` : '<span class="participant-state">Participe</span>'}</div>`;
  }).join('');
  if (data.draw) {
    const done = (data.draw.revealed || []).length;
    $('#santa-status').textContent = done === people ? 'Tout le monde a découvert son tirage. À vous de jouer !' : `Tirage effectué · ${done} sur ${people} personnes ont découvert leur destinataire.`;
    $('#draw-button').innerHTML = 'Recommencer le tirage <span>↻</span>';
  } else {
    $('#santa-status').textContent = '';
    $('#draw-button').innerHTML = 'Lancer le tirage <span>→</span>';
  }
  $('#manage-members').innerHTML = data.members.map((member) => `<div class="manage-row">${avatar(member)}<strong>${esc(member.name)}</strong>${data.members.length > 2 ? `<button class="remove-member" type="button" data-remove="${esc(member.id)}" aria-label="Retirer ${esc(member.name)}">×</button>` : ''}</div>`).join('');
}
function render() { updateHeader(); renderHome(); renderCalendar(); renderMembers(); }
function navigate(view) {
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb-current').textContent = { accueil: 'Accueil', calendrier: 'Calendrier', cadeaux: 'Secret Santa' }[view] || 'Accueil';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openDialog(id) { document.getElementById(id).showModal(); }
function closeDialog(id) { document.getElementById(id).close(); }
function openEventDialog() {
  const form = $('#event-form'); form.reset(); form.elements.date.value = localDate(today); openDialog('event-dialog');
}
function openMembersDialog() { renderMembers(); openDialog('members-dialog'); }
function makeDraw() {
  if (data.members.length < 2) { showToast('Il faut au moins deux personnes pour faire un tirage.'); return; }
  const recipients = data.members.map((member) => member.id);
  let shuffled = [];
  for (let attempt = 0; attempt < 500; attempt++) {
    shuffled = [...recipients].sort(() => Math.random() - 0.5);
    if (recipients.every((id, index) => id !== shuffled[index])) break;
  }
  if (recipients.some((id, index) => id === shuffled[index])) {
    shuffled = [...recipients.slice(1), recipients[0]];
  }
  const assignments = Object.fromEntries(recipients.map((id, index) => [id, shuffled[index]]));
  data.draw = { assignments, revealed: [] }; save(); render(); showToast('Le tirage est fait. Chacun son tour !');
}
function revealFor(id) {
  if (!data.draw) return;
  const member = memberById(id); const recipient = memberById(data.draw.assignments[id]);
  if (!member || !recipient) return;
  $('#reveal-for').textContent = `${member.name}, tu dois gâter…`;
  $('#reveal-name').textContent = recipient.name;
  openDialog('reveal-dialog');
  if (!data.draw.revealed.includes(id)) { data.draw.revealed.push(id); save(); renderMembers(); }
}
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
$('#add-event-home').addEventListener('click', openEventDialog);
$('#add-event-calendar').addEventListener('click', openEventDialog);
$('#members-button').addEventListener('click', openMembersDialog);
$('#add-member-button').addEventListener('click', openMembersDialog);
$('#santa-add-member').addEventListener('click', openMembersDialog);
$('#share-button').addEventListener('click', () => showToast('Pour le moment, les données sont enregistrées sur cet appareil.'));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.close)));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
$('#event-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
  data.events.push({ id: `e${Date.now()}`, title: fields.get('title').trim(), date: fields.get('date'), time: fields.get('time'), place: fields.get('place').trim(), category: fields.get('category') });
  save(); render(); closeDialog('event-dialog'); showToast('Événement ajouté au calendrier !');
});
$('#member-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get('name').trim();
  if (!name) return;
  if (data.members.some((member) => member.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) { showToast('Cette personne est déjà dans le groupe.'); return; }
  data.members.push({ id: `m${Date.now()}`, name, color: palette[data.members.length % palette.length] });
  data.draw = null; save(); render(); form.reset(); showToast('Bienvenue dans la bande !');
});
$('#manage-members').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove]'); if (!button || data.members.length <= 2) return;
  const member = memberById(button.dataset.remove); data.members = data.members.filter((person) => person.id !== button.dataset.remove);
  data.draw = null; save(); render(); showToast(`${member?.name || 'Membre'} a été retiré du groupe.`);
});
$('#participant-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-reveal]'); if (button && data.draw) revealFor(button.dataset.reveal);
});
$('#draw-button').addEventListener('click', () => {
  if (!data.draw) { makeDraw(); return; }
  if (window.confirm('Relancer le tirage ? Les personnes devront découvrir leur nouveau destinataire.')) makeDraw();
});
$('#prev-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
$('#next-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$('#today-button').addEventListener('click', () => { calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1); renderCalendar(); });
render();
