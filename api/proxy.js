export default async function handler(req, res) {
  const url = 'https://stream-lite-eta.vercel.app/'; // link do JSON original
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao buscar JSON' });
  }
}
