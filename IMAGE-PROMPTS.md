# ホームページ・ゲームの画像生成記録

方式: built-in image_gen（CLIは使用していません）。2026年9月6日生成。
全画像を確認し、以下のプロジェクト内パスへコピー済み。画像中の人物は架空です。

保存先ルート: `C:/Users/donad/OneDrive/デスクトップ/積み込みゲーム/assets/images/`

## company-team.png

Create a wide 16:9 photorealistic Japanese corporate recruitment hero photo for a completely fictional logistics company. A diverse team of six adult Japanese logistics employees, men and women ages 20s to 50s, smiling naturally but professionally in a clean loading yard. Foreground warehouse staff wear correctly fitted white or green safety helmets, chin straps where appropriate, green-blue high-visibility vests, work gloves, long sleeves and safety shoes. Background shows a modern warehouse and generic deep-green delivery trucks with no visible brand, no readable text, no license plates. Bright soft morning light, honest documentary commercial photography, safe spacing, tidy site, lively yet serious. No text, no logo, no watermark, no real company marks, no recognizable public figures.

## company-office.png

Create a wide 3:2 photorealistic Japanese corporate website photo featuring a completely fictional adult Japanese female dispatch office employee in her early 30s professionally answering a desk telephone in a modern logistics control office. She is polished, warm and confident, wearing tasteful navy-green business attire, natural appearance, subtle friendly smile, looking toward her workstation rather than posing. Behind her, softly blurred route monitors and coworkers suggest a busy transport operations center; no readable screens or personal data. Green and blue color accents, clean editorial commercial photography, realistic proportions. No text, no logo, no watermark, no recognizable public figures.

## company-sales.png

Create a wide 3:2 photorealistic Japanese corporate website photo featuring a completely fictional adult Japanese male logistics sales representative in his late 30s. He wears a modern navy suit with a muted green tie and holds a tablet, speaking cordially with a warehouse customer at a clean distribution center. In the background are generic green trucks, palletized cargo, and an orderly loading bay; safety boundaries are respected, nobody stands in a forklift travel path. Professional, approachable, trustworthy, green-blue corporate color palette, editorial commercial photography. No text, no logo, no watermark, no readable documents, no real company marks, no recognizable public figures.

## company-president.png

Create a vertical 4:5 photorealistic corporate executive portrait for the website of a completely fictional Japanese logistics company. A fictional Japanese man in his mid-50s, president and founder, calm confident expression with a restrained warm smile, charcoal suit, white shirt, deep green tie. Seated near a window in a sophisticated modern office, subtle green and blue accents, soft natural light, medium close-up with clean negative space, premium Japanese annual-report photography. Distinct original face, no resemblance to public figures. No text, no logo, no watermark.

## company-manager-east.png

Create a vertical 4:5 photorealistic corporate portrait for the website of a completely fictional Japanese logistics company. A fictional Japanese man in his late 40s, East Operations General Manager, practical and kind expression, neat navy work jacket over a white shirt, standing in a spotless logistics depot with a generic green truck softly blurred behind. Confident but approachable, subtle green-blue color palette, soft natural light, annual-report photography. Distinct original face, no resemblance to public figures. No helmet indoors in portrait area, no text, no logo, no watermark.

## company-manager-central.png

Create a vertical 4:5 photorealistic corporate portrait for the website of a completely fictional Japanese logistics company. A fictional Japanese woman in her early 40s, Central Region Branch Manager, intelligent composed expression and friendly slight smile, tailored navy business jacket with muted green blouse. Modern logistics office and warehouse windows softly blurred behind, green and blue accents, soft natural light, annual-report photography. Distinct original face, no resemblance to public figures. No text, no logo, no watermark.

## company-manager-west.png

Create a vertical 4:5 photorealistic corporate portrait for the website of a completely fictional Japanese logistics company. A fictional Japanese man in his early 40s, West Region General Manager, energetic trustworthy expression and natural smile, navy logistics work jacket with green piping over a collared shirt. Clean distribution center loading bay softly blurred behind, safe organized workplace, green and blue corporate palette, soft natural light, annual-report photography. Distinct original face, no resemblance to public figures. No text, no logo, no watermark.

## 夜間配送ゲーム用素材（2026年9月）

方式: built-in image_gen。CLIは使用していません。以下はすべて上記保存先ルートへ保存済みで、`js/transport.js` から利用しています。

### night-city.png

Wide panoramic Japanese waterfront city at night, beautiful illuminated towers and harbor lights, blue teal and warm gold, polished realistic game background, no words no logos. Side view skyline, horizontal scrolling background with matching dark edges, no foreground vehicles.

### highway-map.png

Top down orthographic vertical two lane Japanese expressway game road tile at night. Exactly two same direction lanes, driving upward, straight parallel road edges, dashed white center divider, left shoulder and right barrier, blue illuminated city landscaping at sides. Road centered fills middle 60 percent. No vehicles, no text, no arrows, no perspective. Seamless top and bottom tile for continuous scrolling. High quality realistic game map.

### truck-top-cutout.png

初期生成（truck-top.png）:

Transparent background isolated top down orthographic view of a generic green Japanese box truck with silver cargo roof, cab at TOP pointing UP, complete vehicle centered with generous transparent margin, realistic polished 2D game sprite, no perspective, no text or logos, no ground shadow.

最終編集は下記の共通切り抜きプロンプトを使用。

### patrol-top-cutout.png

初期生成（patrol-top.png）:

Transparent background isolated top down orthographic view of a generic Japanese black and white highway patrol car with red rooftop lightbar, front at TOP pointing UP, full car centered with transparent margin, realistic polished game sprite, no text logos or real insignia, no perspective, no ground shadow.

最終編集は下記の共通切り抜きプロンプトを使用。

### 共通切り抜きプロンプト

Extract the entire vehicle including mirrors and wheels from this exact image. Remove ALL black gray glowing background, make genuinely transparent alpha background. Preserve the vehicle and its top down orientation, no other changes. Tight crop around full vehicle with small transparent margin. No ground, no shadow, no glow.

### car-civilian.png

編集対象: patrol-top-cutout.png。最終プロンプト:

Edit this transparent PNG vehicle sprite. Preserve the existing alpha transparency exactly. Remove the red roof lightbar and replace police black-and-white livery with uniform metallic silver car paint. Ordinary civilian sedan, not a police car. Keep same overhead view, pointing up, exact silhouette, transparent pixels unchanged. Absolutely no checkerboard pattern, no backdrop.

注意: 普通車の生成出力には不透明な背景が残ったため、ゲーム描画時に車体輪郭のクリッピングを適用しています。透過PNGとしては扱っていません。車両・道路の画像は装飾用で、接触判定はゲーム内座標で管理します。
