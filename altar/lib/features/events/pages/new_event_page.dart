import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../../core/models/church_event.dart';
import '../../billing/plans.dart';
import '../events_repository.dart';

/// Pastor marca culto, encontro presencial ou encontro online.
class NewEventPage extends StatefulWidget {
  const NewEventPage({super.key, required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  State<NewEventPage> createState() => _NewEventPageState();
}

class _NewEventPageState extends State<NewEventPage> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _place = TextEditingController();
  final _url = TextEditingController();
  String _type = ChurchEvent.typeCulto;
  DateTime _when = DateTime.now().add(const Duration(days: 1));
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _place.dispose();
    _url.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _when,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_when),
    );
    if (time == null) return;
    setState(() {
      _when = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await EventsRepository.instance.createEvent(
        churchId: widget.church.id,
        createdBy: widget.user.uid,
        title: _title.text,
        startsAt: _when,
        type: _type,
        place: _place.text,
        onlineUrl: _url.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Evento marcado')),
      );
      Navigator.of(context).pop();
    } on EventsFailure catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final onlineAllowed = ChurchAccess.allowsOnline(widget.church);
    final fmt = DateFormat("EEEE, d 'de' MMMM 'às' HH:mm", 'pt_BR');
    return Scaffold(
      appBar: AppBar(title: const Text('Novo evento')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              SegmentedButton<String>(
                segments: [
                  for (final t in ChurchEvent.types)
                    ButtonSegment(
                      value: t,
                      label: Text(ChurchEvent.typeLabel(t)),
                      enabled: t != ChurchEvent.typeOnline || onlineAllowed,
                    ),
                ],
                selected: {_type},
                onSelectionChanged: (s) => setState(() => _type = s.first),
              ),
              if (!onlineAllowed)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Encontro online está nos planos Comunhão e Missão.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _title,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Título'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Informe o título' : null,
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.schedule),
                title: Text(fmt.format(_when)),
                subtitle: const Text('Toque para mudar data e hora'),
                onTap: _pickDateTime,
              ),
              const SizedBox(height: 12),
              if (_type != ChurchEvent.typeOnline)
                TextFormField(
                  controller: _place,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Local'),
                ),
              if (_type == ChurchEvent.typeOnline)
                TextFormField(
                  controller: _url,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: 'Link do encontro (Meet, Zoom, live)',
                    hintText: 'https://meet.google.com/...',
                  ),
                  validator: (v) {
                    final uri = Uri.tryParse(v?.trim() ?? '');
                    if (uri == null || !uri.hasScheme || !uri.host.contains('.')) {
                      return 'Encontro online precisa de um link válido';
                    }
                    return null;
                  },
                ),
              const SizedBox(height: 8),
              Text(
                'Quem confirmar presença recebe um lembrete 60 minutos antes.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: const Text('Marcar evento'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
