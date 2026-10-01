import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_policy.dart';

/// Rewarded fica preparado, mas desligado. Liga na fase do quiz quando o
/// produto decidir.
const bool kRewardedAdsEnabled = false;

/// IDs de teste do Google. Trocar pelos IDs reais na fase de loja.
class AdUnitIds {
  AdUnitIds._();

  static String get banner => Platform.isIOS
      ? 'ca-app-pub-3940256099942544/2934735716'
      : 'ca-app-pub-3940256099942544/6300978111';

  static String get interstitial => Platform.isIOS
      ? 'ca-app-pub-3940256099942544/4411468910'
      : 'ca-app-pub-3940256099942544/1033173712';

  static String get rewarded => Platform.isIOS
      ? 'ca-app-pub-3940256099942544/1712485313'
      : 'ca-app-pub-3940256099942544/5224354917';
}

/// Único ponto de contato com o SDK de anúncios.
///
/// Sem `consentAds`, nada é inicializado nem carregado.
class AdsService extends ChangeNotifier {
  AdsService._();

  static final AdsService instance = AdsService._();

  bool _sdkReady = false;
  bool _consent = false;
  InterstitialAd? _interstitial;
  RewardedAd? _rewarded;

  bool get consent => _consent;

  /// Só mostra anúncio com consentimento e SDK pronto.
  bool get canShowAds => _consent && _sdkReady;

  bool get rewardedAvailable =>
      kRewardedAdsEnabled && canShowAds && _rewarded != null;

  /// Chamado quando o consentimento do usuário é conhecido ou muda.
  Future<void> setConsent(bool value) async {
    if (_consent == value && (_sdkReady || !value)) return;
    _consent = value;
    if (!value) {
      _interstitial?.dispose();
      _interstitial = null;
      _rewarded?.dispose();
      _rewarded = null;
      notifyListeners();
      return;
    }
    await _initSdk();
    notifyListeners();
  }

  Future<void> _initSdk() async {
    if (_sdkReady) return;
    if (kIsWeb || !(Platform.isAndroid || Platform.isIOS)) return;
    try {
      await MobileAds.instance.initialize();
      _sdkReady = true;
      _preloadInterstitial();
      if (kRewardedAdsEnabled) _preloadRewarded();
    } catch (e) {
      debugPrint('AdMob não inicializou: $e');
    }
  }

  BannerAd? createBanner({required void Function() onLoaded}) {
    if (!canShowAds) return null;
    return BannerAd(
      adUnitId: AdUnitIds.banner,
      size: AdSize.banner,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (_) => onLoaded(),
        onAdFailedToLoad: (ad, err) {
          debugPrint('Banner falhou: ${err.message}');
          ad.dispose();
        },
      ),
    )..load();
  }

  void _preloadInterstitial() {
    if (!canShowAds || _interstitial != null) return;
    InterstitialAd.load(
      adUnitId: AdUnitIds.interstitial,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) => _interstitial = ad,
        onAdFailedToLoad: (err) => debugPrint('Intersticial falhou: $err'),
      ),
    );
  }

  /// Decide e mostra o intersticial após um compartilhamento, seguindo
  /// [AdPolicy.shouldShowInterstitial]. Nunca em rota proibida: o chamador
  /// é a tela do versículo.
  Future<void> afterShare({required int sharesTodayBefore}) async {
    if (!canShowAds) return;
    if (!AdPolicy.shouldShowInterstitial(sharesTodayBefore: sharesTodayBefore)) {
      return;
    }
    final ad = _interstitial;
    if (ad == null) {
      _preloadInterstitial();
      return;
    }
    _interstitial = null;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (a) {
        a.dispose();
        _preloadInterstitial();
      },
      onAdFailedToShowFullScreenContent: (a, _) {
        a.dispose();
        _preloadInterstitial();
      },
    );
    await ad.show();
  }

  void _preloadRewarded() {
    if (!kRewardedAdsEnabled || !canShowAds || _rewarded != null) return;
    RewardedAd.load(
      adUnitId: AdUnitIds.rewarded,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          _rewarded = ad;
          notifyListeners();
        },
        onAdFailedToLoad: (err) => debugPrint('Rewarded falhou: $err'),
      ),
    );
  }

  /// Mostra o rewarded e devolve `true` se a pessoa assistiu até o fim.
  /// Com [kRewardedAdsEnabled] desligado, devolve sempre `false`.
  Future<bool> showRewarded() async {
    final ad = _rewarded;
    if (!rewardedAvailable || ad == null) return false;
    _rewarded = null;
    var earned = false;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (a) {
        a.dispose();
        _preloadRewarded();
      },
      onAdFailedToShowFullScreenContent: (a, _) {
        a.dispose();
        _preloadRewarded();
      },
    );
    await ad.show(onUserEarnedReward: (_, _) => earned = true);
    return earned;
  }
}
