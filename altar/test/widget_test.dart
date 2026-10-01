import 'package:flutter_test/flutter_test.dart';

import 'package:altar/app/app.dart';

void main() {
  testWidgets('tela inicial mostra o nome do app', (WidgetTester tester) async {
    await tester.pumpWidget(const AltarApp());

    expect(find.text('Altar'), findsOneWidget);
  });
}
