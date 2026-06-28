-- Pulponi Cup — Mensajes del Kraken para la fase de dieciseisavos de final.
-- Insertar una sola vez en Supabase → SQL Editor (cada corrida agrega filas nuevas).
-- profile_id = 00000000-0000-0000-0000-000000000001 (El Kraken), match_id = 'general'.

INSERT INTO public.comments (profile_id, match_id, body, is_kraken, created_at)
VALUES
('00000000-0000-0000-0000-000000000001', 'general',
'🦑 La fase de grupos terminó. Los débiles cayeron. Solo quedan 32. El Kraken observa desde las profundidades... ¿quién será digno de su corona?',
true, now() - interval '2 hours'),

('00000000-0000-0000-0000-000000000001', 'general',
'🦑 Dieciseisavos de final. El torneo empieza de verdad. Un error y estás fuera. El Kraken no perdona y el Mundial tampoco.',
true, now() - interval '1 hour 30 minutes'),

('00000000-0000-0000-0000-000000000001', 'general',
'🦑 México vs Ecuador. Brasil vs Japón. Argentina vs Cabo Verde. El Kraken siente la tensión. ¿Sus pulpos están listos para lo que viene?',
true, now() - interval '1 hour'),

('00000000-0000-0000-0000-000000000001', 'general',
'🦑 El Trono Kraken observa la eliminatoria. Cada predicción vale más. Cada error duele más. El camino a la final apenas comienza... ¿quién llegará?',
true, now() - interval '30 minutes'),

('00000000-0000-0000-0000-000000000001', 'general',
'🦑 Solo el más fuerte merece la corona. En la quiniela y en el Mundial. El Kraken lo sabe. ¿Lo saben ustedes, pulpos?',
true, now());
