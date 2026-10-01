import 'package:altar/app/routes.dart';
import 'package:altar/features/ads/ad_policy.dart';
import 'package:altar/features/ads/widgets/ad_banner.dart';
import 'package:altar/features/auth/pages/sign_in_page.dart';
import 'package:altar/features/auth/pages/sign_up_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('rotas proibidas', () {
    test('lista cobre dízimo, evento, oração, login, cadastro e plano', () {
      expect(AdPolicy.isForbidden(AppRoutes.giving), isTrue);
      expect(AdPolicy.isForbidden(AppRoutes.eventDetail), isTrue);
      expect(AdPolicy.isForbidden('${AppRoutes.eventDetail}/abc'), isTrue);
      expect(AdPolicy.isForbidden(AppRoutes.prayer), isTrue);
      expect(AdPolicy.isForbidden(AppRoutes.login), isTrue);
      expect(AdPolicy.isForbidden(AppRoutes.signUp), isTrue);
      expect(AdPolicy.isForbidden(AppRoutes.billing), isTrue);
      expect(AdPolicy.isForbidden(AppRoutes.verseHome), isFalse);
      expect(AdPolicy.isForbidden(null), isFalse);
    });

    testWidgets('AdBanner numa rota proibida falha em debug', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          onGenerateRoute: (_) => MaterialPageRoute<void>(
            settings: const RouteSettings(name: AppRoutes.giving),
            builder: (_) => const Scaffold(body: AdBanner()),
          ),
        ),
      );
      expect(tester.takeException(), isAssertionError);
    });

    testWidgets('telas de login e cadastro não contêm AdBanner',
        (tester) async {
      for (final page in <Widget>[const SignInPage(), const SignUpPage()]) {
        await tester.pumpWidget(MaterialApp(home: page));
        expect(find.byType(AdBanner), findsNothing);
      }
    });
  });

  group('intersticial', () {
    test('nunca no primeiro compartilhamento do dia', () {
      expect(AdPolicy.shouldShowInterstitial(sharesTodayBefore: 0), isFalse);
    });

    test('no máximo 1 a cada 3', () {
      final shown = <int>[];
      for (var before = 0; before < 9; before++) {
        if (AdPolicy.shouldShowInterstitial(sharesTodayBefore: before)) {
          shown.add(before + 1);
        }
      }
      expect(shown, [3, 6, 9]);
    });
  });
}
