const palette = ['#d99b75', '#81966e', '#b88491', '#8099ad', '#c39a5d', '#8d83ad', '#719a8b'];
const categories = { apero: 'Apéro', diner: 'Dîner', sortie: 'Sortie', anniversaire: 'Anniversaire', autre: 'Moment sympa' };
const categoryEmojis = { apero: '🍷', diner: '🍝', sortie: '🎟️', anniversaire: '🎂', autre: '✨' };
const today = new Date();
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let data = { group: null, members: [], events: [], draw: null, currentUser: null, myMemberId: null };
let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let authMode = 'login';
let passwordRecovery = false;
let toastTimer;
let groupChannel;
let refreshTimer;
let loadingUserId;

function setAuthMessage(message, success = false) {
  const element = $('#auth-message');
  element.textContent = message;
  element.classList.toggle('success', success);
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === 'signup';
  $('#auth-name-label').hidden = !signingUp;
  $('#auth-name-label').querySelector('input').required = signingUp;
  $('#auth-submit').innerHTML = signingUp ? 'Créer mon compte <span>→</span>' : 'Se connecter <span>→</span>';
  $('#auth-title').textContent = signingUp ? 'Bienvenue chez nous.' : 'Retrouvons-nous.';
  $('#auth-description').textContent = signingUp
    ? 'Crée ton compte depuis le lien d’invitation reçu. Le premier compte doit utiliser l’adresse autorisée du groupe.'
    : 'Connecte-toi pour retrouver le calendrier de la bande.';
  $('#auth-switch-copy').innerHTML = signingUp
    ? 'Déjà un compte ? <button class="auth-link" id="auth-switch" type="button">Se connecter</button>'
    : 'Pas encore de compte ? <button class="auth-link" id="auth-switch" type="button">Créer un compte</button>';
  $('#forgot-password').hidden = signingUp || passwordRecovery;
  $('#auth-form').elements.password.autocomplete = signingUp ? 'new-password' : (passwordRecovery ? 'new-password' : 'current-password');
  if (passwordRecovery) {
    $('#auth-title').textContent = 'Nouveau mot de passe.';
    $('#auth-description').textContent = 'Choisis un nouveau mot de passe pour ton compte.';
    $('#auth-submit').innerHTML = 'Enregistrer le mot de passe <span>→</span>';
    $('#auth-switch-copy').hidden = true;
    $('#forgot-password').hidden = true;
  } else {
    $('#auth-switch-copy').hidden = false;
  }
}

function showAuth({ onboarding = false, signedIn = false } = {}) {
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = false;
  $('#auth-form').hidden = onboarding;
  $('#onboarding-form').hidden = !onboarding;
  $('#auth-switch-copy').hidden = signedIn || onboarding || passwordRecovery;
  $('#forgot-password').hidden = signedIn || onboarding || passwordRecovery || authMode === 'signup';
  $('#signout-button').hidden = !signedIn;
  if (onboarding) {
    const token = new URLSearchParams(window.location.search).get('invite') || sessionStorage.getItem('quickos-invite') || '';
    if (token) $('#onboarding-form').elements.invite.value = token;
    $('#onboarding-form').elements.groupName.value ||= 'Les Quickos';
    $('#auth-title').textContent = 'Encore une étape.';
    $('#auth-description').textContent = 'Crée le groupe ou rejoins tes amis avec leur invitation.';
    $('#create-group-fields').hidden = Boolean(token);
  } else if (signedIn) {
    $('#auth-title').textContent = 'Ton compte est prêt.';
    $('#auth-description').textContent = 'Pour accéder au calendrier, crée le groupe initial ou rejoins-le avec un lien d’invitation.';
  } else {
    setAuthMode(authMode);
  }
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function avatar(member, extra = '') {
  const index = data.members.findIndex((person) => person.id === member.id);
  const color = member.color || palette[(index < 0 ? 0 : index) % palette.length];
  const initials = member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return `<span class="friend-avatar ${extra}" style="background:${esc(color)}" aria-label="${esc(member.name)}">${esc(initials)}</span>`;
}

function formatDate(dateString, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('fr-FR', options).format(new Date(`${dateString}T12:00:00`));
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
  $('#santa-home-copy').textContent = data.draw?.active ? 'Le tirage est fait. Chaque membre découvre uniquement son propre destinataire.' : 'Le tirage au sort attend que la bande soit prête. Qui va gâter qui cette année ?';
  $('#santa-home-button').innerHTML = data.draw?.active ? 'Voir mon tirage <span>→</span>' : 'Préparer le tirage <span>→</span>';
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  $('#month-title').textContent = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);
  const headers = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  let html = headers.map((label) => `<div class="weekday">${label}</div>`).join('');
  for (let index = 0; index < 42; index++) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const date = localDate(day);
    const outside = day.getMonth() !== month;
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
  $('#santa-members').innerHTML = data.members.map((member) => `<div class="santa-member">${avatar(member)}<strong>${esc(member.name)}</strong>${member.id === data.myMemberId ? '<span class="member-you">Toi</span>' : ''}</div>`).join('');
  $('#participant-list').innerHTML = data.members.map((member) => {
    const isMe = member.id === data.myMemberId;
    let state = '<span class="participant-state">Participe</span>';
    if (data.draw?.active && isMe) {
      state = `<button class="participant-state own-reveal" id="reveal-my-draw">${data.draw.mine_revealed ? 'Revoir mon tirage' : 'Révéler mon tirage'}</button>`;
    } else if (data.draw?.active) {
      state = '<span class="participant-state">Tirage personnel</span>';
    }
    return `<div class="participant">${avatar(member)}<span class="participant-name">${esc(member.name)}</span>${state}</div>`;
  }).join('');
  if (data.draw?.active) {
    $('#santa-status').textContent = `Tirage effectué · ${data.draw.revealed} sur ${data.draw.total} personnes ont découvert leur destinataire.`;
    $('#draw-button').hidden = !data.draw.can_manage;
    $('#draw-button').innerHTML = 'Relancer le tirage <span>↻</span>';
    $('#draw-button').disabled = false;
  } else {
    $('#santa-status').textContent = '';
    $('#draw-button').hidden = !data.group || data.group.owner_id !== data.myMemberId;
    $('#draw-button').innerHTML = 'Lancer le tirage <span>→</span>';
    $('#draw-button').disabled = data.members.length < 2;
  }
  $('#manage-members').innerHTML = data.members.map((member) => `<div class="manage-row">${avatar(member)}<strong>${esc(member.name)}</strong>${member.id === data.myMemberId ? '<span class="member-you">Toi</span>' : ''}</div>`).join('');
}

function renderHeader() {
  $('#event-count').textContent = data.events.length;
  $('#member-count').textContent = `${data.members.length} membre${data.members.length > 1 ? 's' : ''}`;
  $('#members-stack').innerHTML = data.members.slice(0, 3).map((member) => avatar(member, 'mini-avatar')).join('');
  $('#today-label').textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(today).toUpperCase();
  $('#friend-avatars').innerHTML = data.members.map((member) => avatar(member)).join('');
  document.querySelectorAll('.group-copy strong, .breadcrumb-group').forEach((element) => { element.textContent = data.group.name; });
  $('#profile-name').textContent = data.members.find((member) => member.id === data.myMemberId)?.name || data.currentUser?.email || 'Membre';
}

function render() {
  renderHeader();
  renderHome();
  renderCalendar();
  renderMembers();
}

function navigate(view) {
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb-current').textContent = { accueil: 'Accueil', calendrier: 'Calendrier', cadeaux: 'Secret Santa' }[view] || 'Accueil';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDialog(id) { document.getElementById(id).showModal(); }
function closeDialog(id) { document.getElementById(id).close(); }
function openEventDialog() {
  const form = $('#event-form');
  form.reset();
  form.elements.date.value = localDate(today);
  showDialog('event-dialog');
}

async function refreshGroupData() {
  const group = await QuickosBackend.getGroup();
  if (!group) {
    data.group = null;
    return false;
  }
  data.group = group;
  data.members = (group.members || []).map((member, index) => ({ ...member, color: palette[index % palette.length] }));
  data.myMemberId = group.members.find((member) => member.id === data.currentUser.id)?.id;
  const [events, draw] = await Promise.all([QuickosBackend.getEvents(group.id), QuickosBackend.getSantaStatus()]);
  data.events = events;
  data.draw = draw;
  render();
  return true;
}

function stopGroupWatch() {
  if (groupChannel) QuickosBackend.client.removeChannel(groupChannel);
  groupChannel = null;
  clearInterval(refreshTimer);
}

function startGroupWatch() {
  stopGroupWatch();
  groupChannel = QuickosBackend.client.channel(`quickos-${data.group.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `group_id=eq.${data.group.id}` }, () => refreshGroupData().catch(showError))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${data.group.id}` }, () => refreshGroupData().catch(showError))
    .subscribe();
  refreshTimer = setInterval(() => refreshGroupData().catch(showError), 30000);
}

function showError(error) {
  const message = error?.message || 'Une erreur est survenue. Réessaie.';
  showToast(message.length > 180 ? 'Une erreur est survenue. Vérifie ta connexion puis réessaie.' : message);
}

async function activateSession(session) {
  if (!session?.user) {
    loadingUserId = null;
    stopGroupWatch();
    data = { group: null, members: [], events: [], draw: null, currentUser: null, myMemberId: null };
    if (!passwordRecovery && QuickosBackend.configured) showAuth();
    return;
  }
  if (loadingUserId === session.user.id && data.group) return;
  loadingUserId = session.user.id;
  data.currentUser = session.user;
  try {
    const joined = await refreshGroupData();
    if (!joined) {
      showAuth({ onboarding: true, signedIn: true });
      return;
    }
    $('#auth-screen').hidden = true;
    $('#app-shell').hidden = false;
    startGroupWatch();
  } catch (error) {
    showAuth({ signedIn: true });
    setAuthMessage(error.message);
  } finally {
    loadingUserId = null;
  }
}

function extractInvite(value) {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.searchParams.get('invite') || trimmed;
  } catch {
    return trimmed;
  }
}

async function createInviteLink() {
  try {
    const token = await QuickosBackend.createInvite(data.group.id);
    const url = new URL('./', window.location.href);
    url.searchParams.set('invite', token);
    $('#invite-link').value = url.href;
    $('#invite-result').hidden = false;
  } catch (error) { showError(error); }
}

function bindEvents() {
  $('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get('email')).trim();
    const password = String(fields.get('password'));
    setAuthMessage('');
    try {
      $('#auth-screen').classList.add('auth-busy');
      if (passwordRecovery) {
        await QuickosBackend.updatePassword(password);
        passwordRecovery = false;
        setAuthMode('login');
        showAuth();
        setAuthMessage('Mot de passe mis à jour. Tu peux te connecter.', true);
      } else if (authMode === 'signup') {
        const name = String(fields.get('name')).trim();
        const inviteToken = new URLSearchParams(window.location.search).get('invite') || sessionStorage.getItem('quickos-invite') || '';
        const result = await QuickosBackend.signUp({ name, email, password, inviteToken });
        if (!result.session) setAuthMessage('Compte créé. Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.', true);
      } else {
        await QuickosBackend.signIn({ email, password });
      }
    } catch (error) { setAuthMessage(error.message); }
    finally { $('#auth-screen').classList.remove('auth-busy'); }
  });

  $('#auth-switch-copy').addEventListener('click', (event) => {
    if (!event.target.closest('#auth-switch')) return;
    setAuthMode(authMode === 'login' ? 'signup' : 'login');
    setAuthMessage('');
  });
  $('#forgot-password').addEventListener('click', async () => {
    const email = $('#auth-form').elements.email.value.trim();
    if (!email) { setAuthMessage('Saisis ton adresse e-mail, puis réessaie.'); return; }
    try {
      await QuickosBackend.resetPassword(email);
      setAuthMessage('Si cette adresse est inscrite, un e-mail de réinitialisation va arriver.', true);
    } catch (error) { setAuthMessage(error.message); }
  });
  $('#signout-button').addEventListener('click', () => QuickosBackend.signOut().catch(showError));
  $('#session-end').addEventListener('click', () => QuickosBackend.signOut().catch(showError));
  $('#profile-signout').addEventListener('click', () => QuickosBackend.signOut().catch(showError));

  $('#create-group-button').addEventListener('click', async () => {
    try {
      $('#create-group-button').disabled = true;
      await QuickosBackend.createGroup($('#onboarding-form').elements.groupName.value.trim() || 'Les Quickos');
      await activateSession({ user: data.currentUser });
    } catch (error) { setAuthMessage(error.message); }
    finally { $('#create-group-button').disabled = false; }
  });

  $('#onboarding-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const token = extractInvite(String(fields.get('invite') || ''));
    const name = String(fields.get('name') || data.currentUser?.user_metadata?.display_name || data.currentUser?.email?.split('@')[0] || '').trim();
    if (!token || token.length < 20) { setAuthMessage('Colle le lien d’invitation reçu par un membre du groupe.'); return; }
    try {
      await QuickosBackend.joinGroup(token, name);
      sessionStorage.removeItem('quickos-invite');
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url);
      await activateSession({ user: data.currentUser });
    } catch (error) { setAuthMessage(error.message); }
  });

  $('#share-button').addEventListener('click', () => {
    renderMembers();
    $('#invite-result').hidden = true;
    showDialog('members-dialog');
    createInviteLink();
  });
  $('#create-invite-button').addEventListener('click', createInviteLink);
  $('#members-button').addEventListener('click', () => { renderMembers(); $('#invite-result').hidden = true; showDialog('members-dialog'); });
  $('#add-member-button').addEventListener('click', () => { renderMembers(); $('#invite-result').hidden = true; showDialog('members-dialog'); });
  $('#santa-add-member').addEventListener('click', () => { renderMembers(); $('#invite-result').hidden = true; showDialog('members-dialog'); });
  $('#copy-invite-button').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#invite-link').value); showToast('Lien copié. Tu peux l’envoyer à tes amis !'); }
    catch { $('#invite-link').select(); document.execCommand('copy'); showToast('Lien sélectionné, copie-le pour le partager.'); }
  });
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
  $('#add-event-home').addEventListener('click', openEventDialog);
  $('#add-event-calendar').addEventListener('click', openEventDialog);
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.close)));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

  $('#event-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const item = { title: String(fields.get('title')).trim(), date: fields.get('date'), time: fields.get('time'), place: String(fields.get('place')).trim(), category: fields.get('category') };
    try {
      await QuickosBackend.createEvent(data.group.id, item);
      await refreshGroupData();
      closeDialog('event-dialog');
      showToast('Événement ajouté au calendrier partagé !');
    } catch (error) { showError(error); }
  });

  $('#draw-button').addEventListener('click', async () => {
    const message = data.draw?.active ? 'Relancer le tirage ? Tous les membres auront un nouveau destinataire.' : 'Lancer le tirage pour les membres actuels ?';
    if (!window.confirm(message)) return;
    try {
      await QuickosBackend.startSantaDraw();
      await refreshGroupData();
      showToast('Le tirage confidentiel est prêt.');
    } catch (error) { showError(error); }
  });

  $('#participant-list').addEventListener('click', async (event) => {
    if (!event.target.closest('#reveal-my-draw')) return;
    try {
      const recipient = await QuickosBackend.revealMySanta();
      $('#reveal-for').textContent = 'Tu dois gâter…';
      $('#reveal-name').textContent = recipient;
      showDialog('reveal-dialog');
      await refreshGroupData();
    } catch (error) { showError(error); }
  });

  $('#prev-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
  $('#next-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
  $('#today-button').addEventListener('click', () => { calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1); renderCalendar(); });
}

async function initialize() {
  bindEvents();
  if (!QuickosBackend.configured) {
    $('#setup-warning').hidden = false;
    $('#auth-form').hidden = true;
    $('#auth-switch-copy').hidden = true;
    $('#forgot-password').hidden = true;
    return;
  }
  const inviteToken = new URLSearchParams(window.location.search).get('invite');
  if (inviteToken) sessionStorage.setItem('quickos-invite', inviteToken);
  const { data: authListener } = QuickosBackend.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      passwordRecovery = true;
      showAuth();
      setAuthMode('login');
      return;
    }
    if (event === 'SIGNED_OUT') {
      passwordRecovery = false;
      setAuthMode('login');
      activateSession(null);
      return;
    }
    if (session) setTimeout(() => activateSession(session), 0);
    else if (event === 'INITIAL_SESSION') showAuth();
  });
  window.addEventListener('beforeunload', () => {
    authListener.subscription.unsubscribe();
    stopGroupWatch();
  }, { once: true });
}

initialize().catch((error) => {
  $('#setup-warning').hidden = false;
  setAuthMessage(error.message);
});
