import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../ad_policy.dart';
import '../ads_service.dart';

/// Banner do AdMob. Só é permitido no feed de versículos.
///
/// Em modo debug, falha se estiver numa rota proibida. Sem consentimento,
/// não ocupa espaço nem carrega nada.
class AdBanner extends StatefulWidget {
  const AdBanner({super.key});

  @override
  State<AdBanner> createState() => _AdBannerState();
}

class _AdBannerState extends State<AdBanner> {
  BannerAd? _ad;
  bool _loaded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final routeName = ModalRoute.of(context)?.settings.name;
    assert(
      !AdPolicy.isForbidden(routeName),
      'AdBanner não pode aparecer na rota $routeName',
    );
    AdsService.instance.addListener(_onAdsChanged);
    _maybeLoad();
  }

  void _onAdsChanged() {
    if (!mounted) return;
    if (!AdsService.instance.canShowAds) {
      _ad?.dispose();
      setState(() {
        _ad = null;
        _loaded = false;
      });
      return;
    }
    _maybeLoad();
  }

  void _maybeLoad() {
    if (_ad != null) return;
    final routeName = ModalRoute.of(context)?.settings.name;
    if (AdPolicy.isForbidden(routeName)) return;
    final ad = AdsService.instance.createBanner(
      onLoaded: () {
        if (mounted) setState(() => _loaded = true);
      },
    );
    if (ad != null) setState(() => _ad = ad);
  }

  @override
  void dispose() {
    AdsService.instance.removeListener(_onAdsChanged);
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ad = _ad;
    if (ad == null || !_loaded) return const SizedBox.shrink();
    return SafeArea(
      top: false,
      child: SizedBox(
        width: ad.size.width.toDouble(),
        height: ad.size.height.toDouble(),
        child: AdWidget(ad: ad),
      ),
    );
  }
}
