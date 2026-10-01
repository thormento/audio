import 'package:flutter_test/flutter_test.dart';

import 'package:altar/app/app.dart';

void main() {
  testWidgets('tela de abertura mostra o nome do app', (tester) async {
    await tester.pumpWidget(const AltarApp(home: SplashPage()));

    expect(find.text('Altar'), findsOneWidget);
  });
}
