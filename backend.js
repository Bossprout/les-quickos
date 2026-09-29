(() => {
  const config = window.QUICKOS_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient);
  const client = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }) : null;

  function requireClient() {
    if (!client) throw new Error('Le service de connexion n’est pas encore configuré.');
    return client;
  }

  async function unwrap(query) {
    const { data, error } = await query;
    if (error) throw new Error(error.message || 'Une erreur est survenue.');
    return data;
  }

  const api = {
    configured,
    client,
    async signUp({ name, email, password }) {
      const supabase = requireClient();
      return unwrap(supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
          emailRedirectTo: window.location.href,
        },
      }));
    },
    async signIn({ email, password }) {
      return unwrap(requireClient().auth.signInWithPassword({ email, password }));
    },
    async resetPassword(email) {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      return unwrap(requireClient().auth.resetPasswordForEmail(email, { redirectTo }));
    },
    async updatePassword(password) {
      return unwrap(requireClient().auth.updateUser({ password }));
    },
    async signOut() {
      return unwrap(requireClient().auth.signOut());
    },
    onAuthStateChange(callback) {
      return requireClient().auth.onAuthStateChange(callback);
    },
    async getSession() {
      const { data, error } = await requireClient().auth.getSession();
      if (error) throw new Error(error.message);
      return data.session;
    },
    async getGroup() {
      return unwrap(requireClient().rpc('get_my_group'));
    },
    async createGroup(name) {
      return unwrap(requireClient().rpc('create_initial_group', { group_name: name }));
    },
    async joinGroup(token, name) {
      return unwrap(requireClient().rpc('redeem_group_invite', {
        invite_token: token,
        member_name: name,
      }));
    },
    async createInvite(groupId) {
      return unwrap(requireClient().rpc('create_group_invite', { target_group: groupId }));
    },
    async getEvents(groupId) {
      const data = await unwrap(requireClient().from('events')
        .select('id,title,event_date,event_time,place,category')
        .eq('group_id', groupId)
        .order('event_date', { ascending: true }));
      return data.map((event) => ({
        id: event.id,
        title: event.title,
        date: event.event_date,
        time: event.event_time?.slice(0, 5) || '',
        place: event.place || '',
        category: event.category,
      }));
    },
    async createEvent(groupId, event) {
      return unwrap(requireClient().from('events').insert({
        group_id: groupId,
        title: event.title,
        event_date: event.date,
        event_time: event.time || null,
        place: event.place || null,
        category: event.category,
      }).select('id').single());
    },
    async getSantaStatus() {
      return unwrap(requireClient().rpc('get_my_santa_status'));
    },
    async startSantaDraw() {
      return unwrap(requireClient().rpc('start_santa_draw'));
    },
    async revealMySanta() {
      return unwrap(requireClient().rpc('reveal_my_santa'));
    },
  };

  window.QuickosBackend = Object.freeze(api);
})();
