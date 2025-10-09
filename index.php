<?php
// URL da tua API JSON
$apiUrl = "https://stream-lite-eta.vercel.app/";

// Tenta obter o conteúdo JSON
$response = @file_get_contents($apiUrl);

if ($response === FALSE) {
  $channels = [];
} else {
  $channels = json_decode($response, true);
  if ($channels === NULL) $channels = [];
}
?>
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stream+ TV - Canais Online</title>
  <style>
    * {margin:0;padding:0;box-sizing:border-box;font-family:"Poppins",sans-serif;}
    body {
      background: radial-gradient(circle at top, #0f0f0f, #000);
      color: #fff;
      min-height: 100vh;
      padding: 20px;
    }
    header {
      text-align: center;
      margin-bottom: 20px;
    }
    header h1 {
      font-size: 2rem;
      background: linear-gradient(90deg, #ff004c, #ffa500);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .category {
      margin: 30px 0;
    }
    .category h2 {
      font-size: 1.4rem;
      margin-bottom: 10px;
      color: #ffcc00;
      border-left: 4px solid #ff004c;
      padding-left: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 15px;
    }
    .card {
      background: rgba(255,255,255,0.05);
      border-radius: 15px;
      overflow: hidden;
      transition: all 0.3s ease;
      cursor: pointer;
      box-shadow: 0 0 10px rgba(255,255,255,0.1);
    }
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 0 15px rgba(255,255,255,0.3);
    }
    .card img {
      width: 100%;
      height: 100px;
      object-fit: cover;
    }
    .card h3 {
      font-size: 0.9rem;
      padding: 10px;
      text-align: center;
    }
    footer {
      text-align: center;
      margin-top: 40px;
      font-size: 0.8rem;
      color: #888;
    }
    footer span {
      color: #ff004c;
    }
  </style>
</head>
<body>
  <header>
    <h1>📺 Stream+ TV</h1>
    <p>Assista canais ao vivo, organizado por categoria</p>
  </header>

  <div id="content">
    <?php if (empty($channels)): ?>
      <p style="color:red;text-align:center;">❌ Falha ao carregar o JSON</p>
    <?php else: ?>
      <?php
        // Agrupar canais por categoria
        $groups = [];
        foreach ($channels as $ch) {
          $group = $ch['group'] ?? 'Outros';
          if (!isset($groups[$group])) $groups[$group] = [];
          $groups[$group][] = $ch;
        }

        // Exibir categorias e canais
        foreach ($groups as $group => $items):
      ?>
        <div class="category">
          <h2><?= htmlspecialchars($group) ?></h2>
          <div class="grid">
            <?php foreach ($items as $ch): ?>
              <div class="card" onclick="window.open('<?= htmlspecialchars($ch['url']) ?>', '_blank')">
                <img src="<?= htmlspecialchars($ch['logo'] ?: 'https://via.placeholder.com/150') ?>" alt="<?= htmlspecialchars($ch['name']) ?>">
                <h3><?= htmlspecialchars($ch['name']) ?></h3>
              </div>
            <?php endforeach; ?>
          </div>
        </div>
      <?php endforeach; ?>
    <?php endif; ?>
  </div>

  <footer>Feito com 💖 por <span>Boy Feljo</span></footer>
</body>
</html>
