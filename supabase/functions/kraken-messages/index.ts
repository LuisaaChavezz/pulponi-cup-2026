// supabase/functions/kraken-messages/index.ts
// Deploy: supabase functions deploy kraken-messages
// Cron:   supabase/pg_cron_kraken_messages.sql

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const KRAKEN_ID = '00000000-0000-0000-0000-000000000001';
const EL_ELEGIDO_BADGE_ID = 'el-elegido';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BANNER_THRONE_CHANGE = [
  '🦑 ¡El Trono Kraken cambió de dueño! {nuevo} arrebató el trono a {anterior}. El Kraken ha hablado.',
  '👑 ¡Nuevo rey en la quiniela! {nuevo} derrocó a {anterior} y se lleva el Trono Kraken.',
  '🦑 ¡Atención pulpos! {anterior} perdió el Trono Kraken. {nuevo} es el nuevo elegido.',
  '💀 {anterior} reinó, pero {nuevo} fue más fuerte. El Trono Kraken tiene nuevo dueño.',
  '🦑 El Kraken ha elegido a {nuevo}. {anterior}, el trono ya no es tuyo.',
];

const BANNER_TIED = [
  '🦑 ¡EMPATE! {elegido} y {retador} están igualados. El Kraken exige un duelo.',
  '💀 {elegido} y {retador} tienen los mismos puntos. El Trono Kraken está en juego ahora mismo.',
  '🦑 El Kraken está furioso. {elegido} y {retador} empatados. Solo uno puede reinar.',
  '⚔️ {retador} alcanzó a {elegido}. El Trono Kraken nunca había estado tan disputado.',
  '🦑 Empate total entre {elegido} y {retador}. El Kraken solo obedece al más fuerte. ¿Quién será?',
  '💀 {elegido} tiene el trono pero {retador} tiene los mismos puntos. Esto es una guerra.',
  '🦑 El Kraken no acepta empates. {elegido} vs {retador}. Solo uno sobrevivirá.',
  '⚔️ ¡Atención pulpos! {elegido} y {retador} están empatados. El Trono Kraken tiembla.',
  '🦑 {retador} igualó a {elegido}. El Trono Kraken está al rojo vivo. El Kraken observa.',
  '💀 La batalla más épica de la quiniela: {elegido} vs {retador}. Empatados. El Kraken decide.',
];

const BANNER_DANGER = [
  '🦑 {retador} está acechando el Trono Kraken de {elegido}. Las profundidades se agitan.',
  '👀 {elegido} sigue en la cima pero {retador} no se rinde. El Trono Kraken tiembla.',
  '🦑 ¿Podrá {elegido} mantener el Trono Kraken? {retador} viene con todo.',
  '⚡ {retador} está pisándole los talones a {elegido}. El Kraken observa con atención.',
  '🦑 El Trono Kraken de {elegido} nunca había estado tan amenazado. {retador} lo sabe.',
  '👀 {retador} huele sangre. {elegido}, el Kraken te está poniendo a prueba.',
  '🦑 La quiniela tiene un nuevo villano: {retador}. {elegido}, cuida tu trono.',
  '⚡ {elegido} reina... por ahora. {retador} tiene otros planes para el Trono Kraken.',
  '🦑 El Kraken siente la ambición de {retador}. {elegido}, no te confíes.',
  '👀 Algo se mueve en las profundidades. {retador} viene por el trono de {elegido}.',
];

const MESSAGES_BEFORE = [
  '🦑 En menos de una hora: {local} vs {visitante}. El Kraken ya sabe quién va a fallar. ¿Eres tú?',
  '⚡ {local} vs {visitante} está por comenzar. El Kraken observa tus predicciones. No lo decepciones.',
  '🦑 ¿Ya pusiste tu predicción para {local} vs {visitante}? El Kraken no acepta excusas.',
  '👀 El Kraken advierte: {local} vs {visitante} empieza pronto. Última oportunidad para cambiar tu pick.',
  '🦑 {local} vs {visitante}. El Kraken ya eligió a sus favoritos. ¿Coincide con tu predicción?',
  '⚡ Atención pulpos: {local} vs {visitante} en menos de una hora. El trono podría cambiar hoy.',
  '🦑 El Kraken siente que {local} vs {visitante} será épico. ¿Estás listo para lo que viene?',
  '👀 Último aviso antes de {local} vs {visitante}. El Kraken no perdona a los indecisos.',
  '🦑 ¿{local} o {visitante}? El Kraken ya lo sabe. En menos de una hora verás si coinciden.',
  '⚡ Se viene {local} vs {visitante}. El Kraken tiene sus favoritos. ¿Tienes los tuyos?',
];

const MESSAGES_AFTER = [
  '🦑 {ganador} ganó {marcador}. El Kraken ya actualizó los puntos. ¿Subiste o bajaste?',
  '👀 {marcador} fue el resultado final. Solo {exactos} pulpos lo adivinaron exacto. ¿Fuiste uno de ellos?',
  '🦑 {ganador} se llevó los tres puntos. El Kraken registró todo. Nadie escapa a las profundidades.',
  '⚡ Resultado: {marcador}. El Kraken observa cómo cambia la quiniela. ¿Cómo quedaste?',
  '🦑 {exactos} aciertos exactos en {local} vs {visitante}. El Kraken está... impresionado. O decepcionado. Tú decides.',
  '👀 El partido terminó {marcador}. {elegido} sigue en el trono... ¿o ya no? Revisa el leaderboard.',
  '🦑 {ganador} ganó y el Kraken sonríe. Algunos pulpos lo vieron venir. Otros... no tanto.',
  '🦑 Final: {marcador}. Si acertaste exacto, el Kraken te saluda. Si no... el Kraken también te saluda, pero diferente.',
  '👀 {local} vs {visitante} terminó. {exactos} pulpos adivinaron el marcador exacto. El Kraken está tomando nota.',
  '🦑 {marcador} y el Kraken está satisfecho. Algunos pulpos lo sabían. Otros aprenderán para el próximo partido.',
];

const KRAKEN_MESSAGES_NEW_KING = [
  'Lo arrebataste. El Kraken ha hablado. El trono te pertenece... por ahora.',
  'Lo lograste. El trono cambió de manos y ahora es tuyo. El Kraken obedece.',
  'Derrocaste al anterior. El trono es tuyo. La quiniela tiembla ante tu nombre.',
];

const KRAKEN_MESSAGES_LOST_THRONE = [
  'El Kraken ha elegido a otro. El trono ya no es tuyo. ¿Lo vas a recuperar?',
  'Alguien fue más fuerte. El Kraken no perdona la debilidad. Vuelve más fuerte.',
  'El Kraken ya no te obedece. Alguien te superó. ¿Qué vas a hacer al respecto?',
];

const KRAKEN_MESSAGES_TIED = [
  { title: '¡El Kraken exige un duelo! 🦑', body: 'Las aguas están revueltas. El trono es tuyo por ahora, pero el Kraken está furioso.' },
  { title: 'Dos reyes, un trono 🦑', body: 'El Kraken no acepta eso. Uno de los dos caerá. Asegúrate de que no seas tú.' },
  { title: 'El Kraken ruge 🦑', body: 'El trono tiembla. El Kraken necesita un campeón. ¿Sigues siendo tú ese campeón?' },
];

const KRAKEN_MESSAGES_DANGER = [
  { title: 'El Kraken huele sangre 🦑', body: 'Algo se mueve en las profundidades. El trono nunca ha sido tan codiciado.' },
  { title: 'Tu trono cruje 🦑', body: 'El Kraken siente la ambición de otro. ¿Puedes sentirla tú también?' },
  { title: 'Se acerca la tormenta 🦑', body: 'Las aguas se agitan. Alguien viene por lo que es tuyo.' },
  { title: 'Peligro en el horizonte 🦑', body: 'El Kraken solo obedece al más fuerte. ¿Sigues siendo tú?' },
];

const KRAKEN_MESSAGES_SAFE = [
  { title: 'El Trono Kraken es tuyo 🦑', body: 'El Kraken obedece. La quiniela tiembla ante tu nombre. Por ahora, el trono es tuyo.' },
  { title: 'El elegido reina 🦑', body: 'Nadie se atreve a desafiarte... todavía. Disfruta el trono, pero nunca bajes la guardia.' },
  { title: 'Poder absoluto 🦑', body: 'El Kraken te ha elegido y la quiniela lo respeta. Sigue así y el trono será tuyo para siempre.' },
];

type ProfileRow = {
  id: string;
  username?: string | null;
  name?: string | null;
  points?: number | null;
};

type ResultRow = Record<string, unknown>;

function env(name: string): string {
  return (Deno.env.get(name) ?? '').trim();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function createServiceRoleClient(): SupabaseClient | null {
  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  });
}

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token === serviceKey) return true;

  const cronSecret = env('CRON_SECRET');
  if (cronSecret && token === cronSecret) return true;

  return false;
}

function firstName(row: ProfileRow | null | undefined, fallback = ''): string {
  const raw = row?.name || row?.username || fallback;
  return String(raw).split(' ')[0] || fallback;
}

function resolveMessage(msg: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'g'), value ?? ''),
    msg,
  );
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type MatchRow = {
  id: string;
  official_id?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  home_score?: number | null;
  away_score?: number | null;
};

async function fetchMatchById(supabase: SupabaseClient, matchId: string): Promise<MatchRow | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, official_id, home_team, away_team, home_score, away_score')
    .eq('id', matchId)
    .maybeSingle();

  if (!error && data) return data as MatchRow;

  const { data: byOfficial } = await supabase
    .from('matches')
    .select('id, official_id, home_team, away_team, home_score, away_score')
    .eq('official_id', matchId)
    .maybeSingle();

  return (byOfficial as MatchRow | null) ?? null;
}

async function krakenBeforeAlreadySent(
  supabase: SupabaseClient,
  match: MatchRow,
): Promise<boolean> {
  const home = String(match.home_team ?? '');
  const away = String(match.away_team ?? '');
  if (!home || !away) return false;

  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('comments')
    .select('id')
    .eq('is_kraken', true)
    .gte('created_at', since)
    .ilike('body', `%${home}%`)
    .ilike('body', `%${away}%`)
    .limit(1);

  return Boolean(data?.length);
}

async function krakenAfterAlreadySent(
  supabase: SupabaseClient,
  match: MatchRow,
  marcador: string,
): Promise<boolean> {
  const home = String(match.home_team ?? '');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('comments')
    .select('id')
    .eq('is_kraken', true)
    .gte('created_at', since)
    .ilike('body', `%${marcador}%`)
    .ilike('body', `%${home}%`)
    .limit(1);

  return Boolean(data?.length);
}

async function insertKrakenPublicComment(
  supabase: SupabaseClient,
  body: string,
  now = new Date(),
): Promise<{ id: string | null; error?: string }> {
  const text = body.trim();
  if (!text) return { id: null, error: 'empty_body' };

  const { data, error } = await supabase
    .from('comments')
    .insert({
      profile_id: KRAKEN_ID,
      match_id: 'general',
      body: text,
      is_kraken: true,
      created_at: now.toISOString(),
    })
    .select('id')
    .single();

  if (error) return { id: null, error: error.message };
  return { id: data.id as string };
}

async function handleTargetedKrakenMessage(
  supabase: SupabaseClient,
  matchId: string,
  type: 'before' | 'after',
): Promise<Response> {
  const match = await fetchMatchById(supabase, matchId);
  if (!match) {
    return jsonResponse({ ok: false, error: 'match_not_found', match_id: matchId }, 404);
  }

  const local = String(match.home_team ?? 'Local');
  const visitante = String(match.away_team ?? 'Visitante');
  const now = new Date();

  if (type === 'before') {
    if (await krakenBeforeAlreadySent(supabase, match)) {
      return jsonResponse({ ok: true, skipped: 'already_sent_before', match_id: match.id, type }, 200);
    }

    const body = resolveMessage(pick(MESSAGES_BEFORE), {
      local,
      visitante,
      elegido: '',
      retador: '',
      nuevo: '',
      anterior: '',
      ganador: '',
      marcador: '',
      exactos: '0',
      miNombre: '',
    });

    const inserted = await insertKrakenPublicComment(supabase, body, now);
    if (inserted.error) {
      return jsonResponse({ ok: false, error: inserted.error, match_id: match.id, type }, 500);
    }

    return jsonResponse(
      { ok: true, match_id: match.id, type, comment_id: inserted.id, preview: body.slice(0, 80) },
      200,
    );
  }

  const home = Number(match.home_score);
  const away = Number(match.away_score);
  if (!Number.isFinite(home) || !Number.isFinite(away)) {
    return jsonResponse({ ok: false, error: 'match_not_scored', match_id: match.id, type }, 400);
  }

  const marcador = `${home}-${away}`;
  if (await krakenAfterAlreadySent(supabase, match, marcador)) {
    return jsonResponse({ ok: true, skipped: 'already_sent_after', match_id: match.id, type }, 200);
  }

  const matchKeys = [String(match.id)];
  if (match.official_id) matchKeys.push(String(match.official_id));

  const { count: exactos } = await supabase
    .from('pick_scores')
    .select('*', { count: 'exact', head: true })
    .in('match_id', matchKeys)
    .eq('exact_hit', true);

  let ganador = 'Empate';
  if (home > away) ganador = local;
  else if (away > home) ganador = visitante;

  const body = resolveMessage(pick(MESSAGES_AFTER), {
    local,
    visitante,
    ganador,
    marcador,
    exactos: String(exactos ?? 0),
    elegido: '',
    retador: '',
    nuevo: '',
    anterior: '',
    miNombre: '',
  });

  const inserted = await insertKrakenPublicComment(supabase, body, now);
  if (inserted.error) {
    return jsonResponse({ ok: false, error: inserted.error, match_id: match.id, type }, 500);
  }

  return jsonResponse(
    { ok: true, match_id: match.id, type, comment_id: inserted.id, preview: body.slice(0, 80) },
    200,
  );
}

function normalizeUsername(value: string | null | undefined): string {
  return String(value ?? '').replace(/^@+/, '').trim();
}

async function profileByUsername(
  supabase: SupabaseClient,
  username: string | null | undefined,
): Promise<ProfileRow | null> {
  const clean = normalizeUsername(username);
  if (!clean) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, points')
    .eq('username', clean)
    .maybeSingle();

  if (error) {
    console.warn('[kraken-messages] profileByUsername', error.message);
    return null;
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  let payload: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try {
      payload = (await req.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  const targetedMatchId = payload.match_id != null ? String(payload.match_id) : '';
  const targetedType = payload.type === 'before' || payload.type === 'after' ? payload.type : null;

  if (targetedMatchId && targetedType) {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return jsonResponse({ ok: false, error: 'missing_supabase_service_role_key' }, 503);
    }
    return handleTargetedKrakenMessage(supabase, targetedMatchId, targetedType);
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return jsonResponse({ ok: false, error: 'missing_supabase_service_role_key' }, 503);
  }

  const now = new Date();
  const results: ResultRow[] = [];

  const insertPublic = async (body: string) => {
    const text = body.trim();
    if (!text) return null;

    const { data, error } = await supabase
      .from('comments')
      .insert({
        profile_id: KRAKEN_ID,
        match_id: 'general',
        body: text,
        is_kraken: true,
        created_at: now.toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      results.push({ type: 'public_error', error: error.message });
      return null;
    }

    results.push({ type: 'public', id: data.id, preview: text.slice(0, 50) });
    return data.id as string;
  };

  const insertPrivate = async (profileId: string, content: string) => {
    const text = content.trim();
    if (!profileId || !text) return null;

    const { data, error } = await supabase
      .from('kraken_private_messages')
      .insert({
        profile_id: profileId,
        content: text,
        seen: false,
        created_at: now.toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      results.push({ type: 'private_error', profileId, error: error.message });
      return null;
    }

    results.push({ type: 'private', id: data.id, profileId });
    return data.id as string;
  };

  const { data: badgeRow, error: badgeErr } = await supabase
    .from('user_badges')
    .select('profile_id')
    .eq('badge_id', EL_ELEGIDO_BADGE_ID)
    .maybeSingle();

  if (badgeErr) {
    return jsonResponse({ ok: false, error: badgeErr.message, results }, 500);
  }

  if (!badgeRow?.profile_id) {
    return jsonResponse({ ok: true, skipped: 'no_elegido_badge', results }, 200);
  }

  const { data: elegidoProfile, error: elegidoErr } = await supabase
    .from('profiles')
    .select('id, username, name, points')
    .eq('id', badgeRow.profile_id)
    .maybeSingle();

  if (elegidoErr || !elegidoProfile) {
    return jsonResponse({ ok: false, error: elegidoErr?.message ?? 'no_elegido_profile', results }, 500);
  }

  const { data: topProfiles, error: topErr } = await supabase
    .from('profiles')
    .select('id, username, name, points')
    .order('points', { ascending: false })
    .limit(10);

  if (topErr || !topProfiles?.length) {
    return jsonResponse({ ok: false, error: topErr?.message ?? 'no_top_profiles', results }, 500);
  }

  const retadorProfile =
    topProfiles.find((row) => row.id !== elegidoProfile.id) ??
    topProfiles[1] ??
    null;

  if (!retadorProfile) {
    return jsonResponse({ ok: true, skipped: 'no_retador', results }, 200);
  }

  const elegido = firstName(elegidoProfile, 'El elegido');
  const retador = firstName(retadorProfile, 'El retador');
  const diferencia = Number(elegidoProfile.points ?? 0) - Number(retadorProfile.points ?? 0);
  const vars: Record<string, string> = {
    elegido,
    retador,
    nuevo: '',
    anterior: '',
    local: '',
    visitante: '',
    ganador: '',
    marcador: '',
    exactos: '0',
    miNombre: '',
  };

  // ── 1. Cambio de trono (elegido_history) ───────────────────────────────────
  const { data: latestTransfer } = await supabase
    .from('elegido_history')
    .select('id, previous_username, new_username, transferred_at')
    .order('transferred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestTransfer?.transferred_at) {
    const transferredAt = new Date(latestTransfer.transferred_at);
    const diffHours = (now.getTime() - transferredAt.getTime()) / (1000 * 60 * 60);

    if (diffHours < 1) {
      const { data: thronePublicSent } = await supabase
        .from('comments')
        .select('id')
        .eq('is_kraken', true)
        .gte('created_at', latestTransfer.transferred_at)
        .ilike('body', '%Trono Kraken%')
        .limit(1);

      if (!thronePublicSent?.length) {
        const nuevoName = firstName(await profileByUsername(supabase, latestTransfer.new_username), latestTransfer.new_username ?? 'El nuevo');
        const anteriorName = firstName(
          await profileByUsername(supabase, latestTransfer.previous_username),
          latestTransfer.previous_username ?? 'El anterior',
        );

        await insertPublic(
          resolveMessage(pick(BANNER_THRONE_CHANGE), {
            ...vars,
            nuevo: nuevoName,
            anterior: anteriorName,
          }),
        );

        const newProfile = await profileByUsername(supabase, latestTransfer.new_username);
        const previousProfile = await profileByUsername(supabase, latestTransfer.previous_username);

        if (newProfile?.id) {
          const { data: existingPrivate } = await supabase
            .from('kraken_private_messages')
            .select('id')
            .eq('profile_id', newProfile.id)
            .gte('created_at', latestTransfer.transferred_at)
            .ilike('content', '%Trono Kraken es tuyo%')
            .limit(1);

          if (!existingPrivate?.length) {
            await insertPrivate(
              newProfile.id,
              `¡El Trono Kraken es tuyo! 🦑\n${pick(KRAKEN_MESSAGES_NEW_KING)}`,
            );
          }
        }

        if (previousProfile?.id) {
          const { data: existingPrivate } = await supabase
            .from('kraken_private_messages')
            .select('id')
            .eq('profile_id', previousProfile.id)
            .gte('created_at', latestTransfer.transferred_at)
            .ilike('content', '%Te quitaron el Trono Kraken%')
            .limit(1);

          if (!existingPrivate?.length) {
            await insertPrivate(
              previousProfile.id,
              `Te quitaron el Trono Kraken 🦑\n${pick(KRAKEN_MESSAGES_LOST_THRONE)}`,
            );
          }
        }
      }
    }
  }

  // ── 2. Empate, peligro o safe ─────────────────────────────────────────────
  if (diferencia === 0) {
    const today = now.toISOString().split('T')[0];
    const { data: tiedToday } = await supabase
      .from('comments')
      .select('id')
      .eq('is_kraken', true)
      .gte('created_at', `${today}T00:00:00`)
      .ilike('body', '%empatados%')
      .limit(1);

    if (!tiedToday?.length) {
      await insertPublic(resolveMessage(pick(BANNER_TIED), vars));

      const { data: privateTiedToday } = await supabase
        .from('kraken_private_messages')
        .select('id')
        .eq('profile_id', elegidoProfile.id)
        .gte('created_at', `${today}T00:00:00`)
        .limit(1);

      if (!privateTiedToday?.length) {
        const msg = pick(KRAKEN_MESSAGES_TIED);
        await insertPrivate(elegidoProfile.id, `${msg.title}\n${msg.body}`);
      }
    }
  } else if (diferencia >= 1 && diferencia <= 2) {
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const { data: dangerRecent } = await supabase
      .from('comments')
      .select('id')
      .eq('is_kraken', true)
      .gte('created_at', twoDaysAgo)
      .ilike('body', '%acechando%')
      .limit(1);

    if (!dangerRecent?.length) {
      await insertPublic(resolveMessage(pick(BANNER_DANGER), vars));

      const { data: privateDangerRecent } = await supabase
        .from('kraken_private_messages')
        .select('id')
        .eq('profile_id', elegidoProfile.id)
        .gte('created_at', twoDaysAgo)
        .limit(1);

      if (!privateDangerRecent?.length) {
        const msg = pick(KRAKEN_MESSAGES_DANGER);
        await insertPrivate(elegidoProfile.id, `${msg.title}\n${msg.body}`);
      }
    }
  } else {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: safeRecent } = await supabase
      .from('kraken_private_messages')
      .select('id')
      .eq('profile_id', elegidoProfile.id)
      .gte('created_at', weekAgo)
      .limit(1);

    if (!safeRecent?.length) {
      const msg = pick(KRAKEN_MESSAGES_SAFE);
      await insertPrivate(elegidoProfile.id, `${msg.title}\n${msg.body}`);
    }
  }

  // ── 3. Antes del partido (≤60 min) ────────────────────────────────────────
  const in60 = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const { data: upcomingMatch } = await supabase
    .from('matches')
    .select('id, home_team, away_team, kickoff')
    .neq('status', 'finished')
    .gte('kickoff', now.toISOString())
    .lte('kickoff', in60)
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (upcomingMatch) {
    const since = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
    const { data: beforeSent } = await supabase
      .from('comments')
      .select('id')
      .eq('is_kraken', true)
      .gte('created_at', since)
      .ilike('body', `%${upcomingMatch.home_team}%`)
      .ilike('body', `%${upcomingMatch.away_team}%`)
      .limit(1);

    if (!beforeSent?.length) {
      await insertPublic(
        resolveMessage(pick(MESSAGES_BEFORE), {
          ...vars,
          local: String(upcomingMatch.home_team ?? ''),
          visitante: String(upcomingMatch.away_team ?? ''),
        }),
      );
    }
  }

  // ── 4. Después del partido (últimas 3 h) ────────────────────────────────
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const { data: lastScored } = await supabase
    .from('matches')
    .select('id, home_team, away_team, home_score, away_score, updated_at')
    .eq('status', 'finished')
    .gte('updated_at', threeHoursAgo)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastScored) {
    const marcador = `${lastScored.home_score}-${lastScored.away_score}`;
    const { data: afterSent } = await supabase
      .from('comments')
      .select('id')
      .eq('is_kraken', true)
      .gte('created_at', threeHoursAgo)
      .ilike('body', `%${marcador}%`)
      .limit(1);

    if (!afterSent?.length) {
      const { count: exactos } = await supabase
        .from('pick_scores')
        .select('*', { count: 'exact', head: true })
        .eq('match_id', lastScored.id)
        .eq('exact_hit', true);

      const home = Number(lastScored.home_score);
      const away = Number(lastScored.away_score);
      let ganador = 'Empate';
      if (Number.isFinite(home) && Number.isFinite(away)) {
        if (home > away) ganador = String(lastScored.home_team ?? 'Local');
        else if (away > home) ganador = String(lastScored.away_team ?? 'Visitante');
      }

      await insertPublic(
        resolveMessage(pick(MESSAGES_AFTER), {
          ...vars,
          local: String(lastScored.home_team ?? ''),
          visitante: String(lastScored.away_team ?? ''),
          ganador,
          marcador,
          exactos: String(exactos ?? 0),
        }),
      );
    }
  }

  return jsonResponse({ ok: true, results, ranAt: now.toISOString() }, 200);
});
