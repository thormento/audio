/**
 * messages.js
 * ------------------------------------------------------------
 * Banco de saudações usadas pela meta "Mensagens". A extensão sorteia
 * uma saudação, mostra e copia para a área de transferência; o envio é
 * sempre manual (você cola no Messenger e envia).
 *
 * Para editar: altere esta lista ou adicione mensagens próprias na
 * página de opções (uma por linha).
 */

import { randomChoice } from './random.js';

export const GREETINGS = [
  'Oi! Tudo bem por aí? Faz tempo que a gente não conversa.',
  'E aí, como você está? Lembrei de você hoje.',
  'Olá! Passando só para dar um oi e saber como andam as coisas.',
  'Bom dia! Que seu dia seja leve e cheio de coisas boas.',
  'Boa tarde! Como está sendo sua semana?',
  'Boa noite! Só queria desejar um bom descanso.',
  'Oi! Vi seu post e lembrei de mandar um abraço.',
  'E aí, sumido(a)! Como vão as coisas?',
  'Olá! Espero que esteja tudo bem com você e com a família.',
  'Oi, tudo certo? Bora colocar o papo em dia qualquer hora dessas?',
  'Bom dia! Passando para desejar uma ótima semana.',
  'Oi! Como foi o fim de semana?',
  'Olá! Faz tempo, né? Como você tem estado?',
  'Oi! Lembrei de você e resolvi mandar uma mensagem.',
  'E aí! Tudo tranquilo por aí?',
  'Olá! Só um oi rápido para saber se está tudo bem.',
  'Oi! Que bom ver você por aqui. Como estão as coisas?',
  'Bom dia! Um café e um bom dia para começar bem.',
  'Boa tarde! Como está o movimento por aí hoje?',
  'Oi! Saudades de trocar uma ideia com você.',
  'Olá! Espero que esteja tendo uma semana boa.',
  'E aí, como anda a vida? Novidades?',
  'Oi! Passando para desejar um dia excelente.',
  'Olá! Tudo bem? Queria saber como você está.',
  'Oi! Vi uma coisa hoje que me lembrou você. Como vai?',
  'Bom dia! Que hoje seja um dia produtivo e tranquilo.',
  'Boa noite! Como foi o seu dia?',
  'Oi! Sumiu, hein? Conta as novidades.',
  'Olá! Mandando um abraço daqui. Tudo bem com você?',
  'Oi! Só para dizer que lembrei de você. Grande abraço!',
  'E aí! Como estão os projetos? Tudo caminhando?',
  'Olá! Espero que o seu dia esteja sendo bom.',
  'Oi! Tudo em paz por aí?',
  'Bom dia! Desejo uma semana cheia de conquistas.',
  'Boa tarde! Só passando para dar um alô.',
  'Oi! Quanto tempo! Vamos marcar alguma coisa?',
  'Olá! Como está a família? Tudo bem por aí?',
  'Oi! Vi que você andou ocupado(a). Tudo certo?',
  'E aí, tudo joia? Como anda a rotina?',
  'Oi! Lembrei da última vez que a gente conversou. Saudades!',
  'Olá! Que seu dia seja tão bom quanto você merece.',
  'Bom dia! Como você acordou hoje?',
  'Boa noite! Passando para desejar bons sonhos.',
  'Oi! Tudo bem? Faz um tempo que queria falar com você.',
  'Olá! Espero que as coisas estejam indo bem aí.',
  'Oi! Só um oi para alegrar o seu dia.',
  'E aí! Alguma novidade boa para contar?',
  'Olá! Como está o coração? Tudo tranquilo?',
  'Oi! Mandando boas energias para a sua semana.',
  'Olá! Estava com saudade. Como você está?'
];

/**
 * Sorteia uma saudação do banco (mais as personalizadas), evitando
 * repetir a anterior quando houver mais de uma opção.
 */
export function randomGreeting(customGreetings = [], previous = null) {
  const pool = GREETINGS.concat(
    Array.isArray(customGreetings) ? customGreetings.filter((m) => typeof m === 'string' && m.trim()) : []
  );
  if (pool.length === 0) return '';
  if (pool.length === 1) return pool[0];
  let text = randomChoice(pool);
  let attempts = 0;
  while (text === previous && attempts < 10) {
    text = randomChoice(pool);
    attempts += 1;
  }
  return text;
}
