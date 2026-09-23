export async function findXenoCantoRecording(supabase, scientificName) {
  const name = String(scientificName || '').trim();
  if (!supabase) throw new Error('Conexão com o Xeno-canto indisponível.');
  if (!name) throw new Error('Nome científico não disponível.');

  const { data, error } = await supabase.functions.invoke('xeno-canto', {
    body: { scientificName: name }
  });
  if (error) throw error;
  if (!data?.found || !data.audioUrl) return null;
  return { audioUrl: data.audioUrl };
}
