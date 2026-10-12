# Blok Kasaba — roleApp blok dünya prototipi

roleApp kasabasının Minecraft Education tarzı bloklarla, gerçek 3B (Three.js) ve
ortografik izometrik kamerayla nasıl görüneceğini gösteren tek dosyalık prototip.

Çalıştırmak için `index.html` dosyasını tarayıcıda açmak yeterli (Three.js r128 cdnjs'den yüklenir).

## Kontroller
- Zemine tıkla/dokun: yürü (A*, 8 yön) · WASD / ok tuşları: kameraya göre adım
- Q / E: kamerayı 90° döndür · tekerlek veya +/−: yakınlaştır
- İzometrik / Perspektif düğmeleri: kamera modunu karşılaştır
- Binaya girince üst yarısı kesilir; Maya, Lina ve Leo yaklaşınca konuşur

## Dokular
Bütün dokular 16×16 px ve sayfada kodla üretilir. Minecraft dokusu kullanılmaz:
Mojang'ın kullanım kurallarına göre doku ve modeller Mojang'a ait ve ücretsiz
paylaşım dahil "ticari kullanım" sayılıyor. Blok tarzı serbest; hazır doku istenirse
Kenney Voxel Pack (CC0) kullanılabilir.

## Belgeye (docs/roleApp) etkisi
- **Bölüm 25 (asset ölçeği):** Boyut tablosu, tuval ve çapa kuralı gereksizleşir; blok = 1 m.
  Codex'ten büyük sprite yerine 16×16 doku istenir.
- **Bölüm 26 (derinlik/dilimleme):** Sıralamayı GPU yapar; ön köşe formülü, dilimleme ve
  ön duvar saydamlığı yerine "içerideysen binanın üst mesh'ini gizle" yeterli.
- **Çarpışma:** Blok ızgarası = yürünebilirlik ızgarası (altta blok, üstte iki boş blok).
- **Karakterler:** 8 yönlü sprite yerine kutulardan model; yürüme kodla, duygu = yüz dokusu.

## Değişmesi gerekenler
- Dünya katmanı Phaser yerine Three.js; diyalog/Spell Book DOM/React katmanında kalır.
- Tiled 3B çizemez: MagicaVoxel/Goxel içe aktarma ya da kendi JSON formatı + oyun içi editör.
- `IsometricMath.ts`, `DepthSort.ts`, `IsoAvatar.ts` gereksizleşir; `PathFinder.ts` ve
  RoomScene'deki API/diyalog/kelime mantığı taşınabilir.
- Mobil (Capacitor): her bölge tek mesh'te birleştirilirse WebView'da rahat çalışır.
- Not: Bu yaklaşım roleApp için daha önce alınan yandan görünüm (Möbius) kararını yeniden açar.
