// Gera o ícone do app em PNG, sem dependências: fundo azul profundo e um
// altar estilizado com chama. Rode `dart run tool/make_icon.dart` e depois
// `dart run flutter_launcher_icons` e `dart run flutter_native_splash:create`.

import 'dart:io';
import 'dart:typed_data';

const int size = 1024;
const List<int> bg = [0x2E, 0x4A, 0x7D];
const List<int> fg = [0xFF, 0xFF, 0xFF];
const List<int> flame = [0xF2, 0xC1, 0x4E];

void main() {
  final icon = _render(withBackground: true);
  File('assets/icon/icon.png').writeAsBytesSync(_png(icon, size, size));
  final splash = _render(withBackground: false);
  File('assets/icon/splash.png').writeAsBytesSync(_png(splash, size, size, alpha: true));
  stdout.writeln('assets/icon/icon.png e assets/icon/splash.png gerados');
}

Uint8List _render({required bool withBackground}) {
  final channels = withBackground ? 3 : 4;
  final px = Uint8List(size * size * channels);
  final cx = size / 2, cy = size / 2;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      List<int>? color;
      // Mesa do altar: tampo e dois pés.
      final top = y >= 560 && y <= 640 && x >= 232 && x <= 792;
      final legL = y > 640 && y <= 820 && x >= 272 && x <= 352;
      final legR = y > 640 && y <= 820 && x >= 672 && x <= 752;
      // Chama: círculo com um pico em cima.
      final dx = x - cx, dy = y - (cy - 120);
      final circle = dx * dx + dy * dy <= 110 * 110;
      final tip = y >= 250 && y < 392 && (dx.abs() <= (y - 250) * 0.78);
      if (top || legL || legR) {
        color = fg;
      } else if (circle || tip) {
        color = flame;
      } else if (withBackground) {
        color = bg;
      }
      final i = (y * size + x) * channels;
      if (color != null) {
        px[i] = color[0];
        px[i + 1] = color[1];
        px[i + 2] = color[2];
        if (channels == 4) px[i + 3] = 255;
      } else if (channels == 4) {
        px[i + 3] = 0;
      }
    }
  }
  return px;
}

// ---- PNG mínimo (zlib do dart:io) --------------------------------------------

Uint8List _png(Uint8List rgb, int w, int h, {bool alpha = false}) {
  final channels = alpha ? 4 : 3;
  final raw = BytesBuilder();
  for (var y = 0; y < h; y++) {
    raw.addByte(0); // filtro None
    raw.add(rgb.sublist(y * w * channels, (y + 1) * w * channels));
  }
  final out = BytesBuilder()
    ..add([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  final ihdr = BytesBuilder()
    ..add(_be32(w))
    ..add(_be32(h))
    ..add([8, alpha ? 6 : 2, 0, 0, 0]);
  _chunk(out, 'IHDR', ihdr.toBytes());
  _chunk(out, 'IDAT', Uint8List.fromList(ZLibEncoder(level: 9).convert(raw.toBytes())));
  _chunk(out, 'IEND', Uint8List(0));
  return out.toBytes();
}

void _chunk(BytesBuilder out, String type, Uint8List data) {
  out.add(_be32(data.length));
  final typeBytes = type.codeUnits;
  out.add(typeBytes);
  out.add(data);
  final crcInput = Uint8List.fromList([...typeBytes, ...data]);
  out.add(_be32(_crc32(crcInput)));
}

List<int> _be32(int v) => [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];

final List<int> _crcTable = List.generate(256, (n) {
  var c = n;
  for (var k = 0; k < 8; k++) {
    c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
  }
  return c;
});

int _crc32(Uint8List data) {
  var c = 0xFFFFFFFF;
  for (final byte in data) {
    c = _crcTable[(c ^ byte) & 0xFF] ^ (c >> 8);
  }
  return (c ^ 0xFFFFFFFF) & 0xFFFFFFFF;
}
