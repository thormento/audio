import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../core/models/app_user.dart';
import '../../../core/time/recife_time.dart';
import '../../ads/ads_service.dart';
import '../points_rules.dart';
import '../points_service.dart';
import 'quiz_question.dart';
import 'quiz_repository.dart';

/// Quiz bíblico: 5 perguntas por dia, +15 por acerto, erro não tira ponto.
class QuizPage extends StatefulWidget {
  const QuizPage({super.key, required this.user});

  final AppUser user;

  @override
  State<QuizPage> createState() => _QuizPageState();
}

class _QuizPageState extends State<QuizPage> {
  late Future<_QuizStart> _start;

  @override
  void initState() {
    super.initState();
    _start = _load();
  }

  Future<_QuizStart> _load() async {
    final today = RecifeTime.dayKey();
    final doneDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(widget.user.uid)
        .collection('quizResults')
        .doc(today)
        .get();
    if (doneDoc.exists) {
      final d = doneDoc.data()!;
      return _QuizStart.done(
        correct: (d['correct'] as num).toInt(),
        total: (d['total'] as num).toInt(),
        points: (d['points'] as num).toInt(),
      );
    }
    final questions = await QuizRepository.instance.dailyQuestions();
    return _QuizStart.ready(questions);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quiz bíblico')),
      body: FutureBuilder<_QuizStart>(
        future: _start,
        builder: (context, snap) {
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Não foi possível carregar o quiz. ${snap.error}'),
              ),
            );
          }
          final start = snap.data;
          if (start == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (start.alreadyDone) {
            return _DoneToday(
              correct: start.correct!,
              total: start.total!,
              points: start.points!,
            );
          }
          return _QuizRunner(
            user: widget.user,
            questions: start.questions!,
            onFinished: () => setState(() => _start = _load()),
          );
        },
      ),
    );
  }
}

class _QuizStart {
  _QuizStart.ready(this.questions)
      : alreadyDone = false,
        correct = null,
        total = null,
        points = null;

  _QuizStart.done({
    required this.correct,
    required this.total,
    required this.points,
  })  : alreadyDone = true,
        questions = null;

  final bool alreadyDone;
  final List<QuizQuestion>? questions;
  final int? correct;
  final int? total;
  final int? points;
}

class _DoneToday extends StatelessWidget {
  const _DoneToday({
    required this.correct,
    required this.total,
    required this.points,
  });

  final int correct;
  final int total;
  final int points;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_outline, size: 48),
            const SizedBox(height: 12),
            Text('Quiz de hoje feito', style: textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('Você acertou $correct de $total e ganhou $points pontos.'),
            const SizedBox(height: 8),
            const Text('Amanhã tem mais.'),
          ],
        ),
      ),
    );
  }
}

class _QuizRunner extends StatefulWidget {
  const _QuizRunner({
    required this.user,
    required this.questions,
    required this.onFinished,
  });

  final AppUser user;
  final List<QuizQuestion> questions;
  final VoidCallback onFinished;

  @override
  State<_QuizRunner> createState() => _QuizRunnerState();
}

class _QuizRunnerState extends State<_QuizRunner> {
  int _index = 0;
  int _correct = 0;
  int? _selected;
  bool _saving = false;
  QuizResult? _result;

  QuizQuestion get _q => widget.questions[_index];
  bool get _answered => _selected != null;
  bool get _isLast => _index == widget.questions.length - 1;

  void _answer(int i) {
    if (_answered) return;
    setState(() {
      _selected = i;
      if (i == _q.correctIndex) _correct++;
    });
  }

  Future<void> _next() async {
    if (!_isLast) {
      setState(() {
        _index++;
        _selected = null;
      });
      return;
    }
    await _finish(doubled: false);
  }

  Future<void> _finish({required bool doubled}) async {
    setState(() => _saving = true);
    try {
      final r = await PointsService.instance.recordQuiz(
        widget.user.uid,
        correct: _correct,
        total: widget.questions.length,
        doubled: doubled,
      );
      if (mounted) setState(() => _result = r);
    } on StateError catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
        widget.onFinished();
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _watchAndDouble() async {
    final earned = await AdsService.instance.showRewarded();
    if (!mounted) return;
    if (!earned) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Anúncio indisponível agora.')),
      );
      return;
    }
    await _finish(doubled: true);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    final result = _result;
    if (result != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.emoji_events, size: 56, color: scheme.primary),
              const SizedBox(height: 12),
              Text('Você acertou ${result.correct} de ${result.total}',
                  style: textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(
                '+${result.points} pontos${result.doubled ? ' (dobrados)' : ''}',
                style: textTheme.headlineSmall?.copyWith(color: scheme.primary),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: widget.onFinished,
                child: const Text('Concluir'),
              ),
            ],
          ),
        ),
      );
    }

    final showDoubleOffer = _isLast &&
        _answered &&
        widget.user.consentAds &&
        AdsService.instance.rewardedAvailable;

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          'Pergunta ${_index + 1} de ${widget.questions.length}',
          style: textTheme.labelLarge,
        ),
        const SizedBox(height: 8),
        LinearProgressIndicator(
          value: (_index + (_answered ? 1 : 0)) / widget.questions.length,
        ),
        const SizedBox(height: 24),
        Text(_q.question, style: textTheme.titleLarge),
        const SizedBox(height: 16),
        for (var i = 0; i < _q.options.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _OptionTile(
              text: _q.options[i],
              state: !_answered
                  ? _OptionState.idle
                  : i == _q.correctIndex
                      ? _OptionState.correct
                      : i == _selected
                          ? _OptionState.wrong
                          : _OptionState.idle,
              onTap: _answered ? null : () => _answer(i),
            ),
          ),
        if (_answered) ...[
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _selected == _q.correctIndex
                        ? 'Acertou! +${PointsRules.quizCorrect} pontos'
                        : 'Não foi dessa vez. Nenhum ponto perdido.',
                    style: textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text('Leia em ${_q.reference}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (showDoubleOffer) ...[
            OutlinedButton.icon(
              onPressed: _saving ? null : _watchAndDouble,
              icon: const Icon(Icons.play_circle_outline),
              label: const Text('Assistir um vídeo e dobrar os pontos (opcional)'),
            ),
            const SizedBox(height: 8),
          ],
          FilledButton(
            onPressed: _saving ? null : _next,
            child: Text(_isLast ? 'Ver resultado' : 'Próxima'),
          ),
        ],
      ],
    );
  }
}

enum _OptionState { idle, correct, wrong }

class _OptionTile extends StatelessWidget {
  const _OptionTile({required this.text, required this.state, this.onTap});

  final String text;
  final _OptionState state;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final Color? bg = switch (state) {
      _OptionState.correct => Colors.green.withValues(alpha: 0.18),
      _OptionState.wrong => scheme.errorContainer,
      _OptionState.idle => null,
    };
    final IconData? icon = switch (state) {
      _OptionState.correct => Icons.check_circle,
      _OptionState.wrong => Icons.cancel,
      _OptionState.idle => null,
    };
    return Material(
      color: bg ?? scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Expanded(child: Text(text)),
              if (icon != null) Icon(icon, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
