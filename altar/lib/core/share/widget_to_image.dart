import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';

/// Captura um `RepaintBoundary` como PNG e grava num arquivo temporário.
Future<File> captureBoundaryToPng(
  GlobalKey boundaryKey, {
  required String fileName,
  double pixelRatio = 3,
}) async {
  final boundary =
      boundaryKey.currentContext!.findRenderObject() as RenderRepaintBoundary;
  final ui.Image image = await boundary.toImage(pixelRatio: pixelRatio);
  final ByteData? bytes =
      await image.toByteData(format: ui.ImageByteFormat.png);
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/$fileName');
  await file.writeAsBytes(bytes!.buffer.asUint8List());
  return file;
}
