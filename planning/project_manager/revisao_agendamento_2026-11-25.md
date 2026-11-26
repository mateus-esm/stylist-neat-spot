# One Fisioterapia · Revisão para a reunião de 26/11

## Demonstração de três minutos

Abra [a demonstração offline](./demonstracao_agendamento.html) no Chrome ou Edge. Ela usa as telas de agendamento do app com uma paciente fictícia. Os dados são reiniciados ao recarregar. O cartão “WhatsApp simulado” permite abrir as mensagens dos dois perfis na mesma tela.

1. No portal de Marina, clique em **Solicitar sessão** e escolha um horário. A agenda mostra **Aguardando confirmação**.
2. Abra o link na mensagem destinada ao **gestor**. Confira paciente e horário e clique em **Aprovar**.
3. Abra o link na mensagem destinada à **paciente**. Clique em **Confirmar presença** e confirme a ação.
4. Volte a **Agenda do gestor**. A sessão de Marina aparece com **Presença confirmada**.
5. Para demonstrar a recusa, reinicie e escolha **Recusar** no segundo passo. A mensagem da paciente abre a seleção de outro horário.

## Revisão do fluxo

| Achado | Alteração nesta versão |
|---|---|
| O paciente recebia confirmação enquanto o pedido aguardava aprovação. | O pedido e o aviso para o número configurado pelo gestor são registrados juntos. A decisão da clínica determina a mensagem seguinte. |
| A API fornecia datas, horários e saldos em campos diferentes dos lidos pelo portal. | O portal e a tela da sessão usam o formato da API. A duração de um pedido acompanha o intervalo reservado. |
| O link identificava uma consulta, mas a tela abria a lista geral. | O link mostra a consulta indicada, seu estado e as ações disponíveis. O login preserva o destino. |
| A tela de disponibilidade e a reserva divergiam para pacientes com profissional atribuído. | As duas operações usam o responsável pelos horários do cadastro. Horários reservados para um paciente só podem ser solicitados por ele. |
| O paciente podia receber um lembrete antigo ou ler sua preferência de WhatsApp como indisponível. | O portal lê o consentimento da própria conta. O envio confere autorização, destino e a situação atual do horário. |
| No celular, consultas simultâneas se cobriam e algumas janelas ultrapassavam a tela. | A agenda diária agrupa os atendimentos por profissional, oferece o filtro “Meus atendimentos” e reorganiza as colunas no celular. Os diálogos permitem rolagem e os botões do paciente têm rótulos. |
| Concluir um atendimento reconstruía o saldo do pacote contando apenas sessões existentes no app. | A conclusão grava evolução e consumo juntos, soma uma sessão ao histórico importado e preserva a escolha de pagamento da sessão avulsa. |
| A importação percorria cada gestor e podia apagar registros migrados com o mesmo nome. | O importador considera a clínica uma vez e preserva o histórico existente. A suíte da API exige um banco de teste explícito. |

## Verificação de 26/11

Passaram 20 testes da API e 3 do frontend, a checagem de tipos do frontend e da API e os dois builds de produção. No Chromium, o roteiro percorreu o HTML offline a 390 e 1440 px, alternou entre dia, semana e mês e verificou que três atendimentos simultâneos continuavam acessíveis.

No PostgreSQL descartável, duas tentativas concorrentes de reserva deixaram um único agendamento. Uma aprovação registrou uma confirmação. Um provedor HTTP local recebeu os textos do gestor e do paciente e o webhook marcou ambos como entregues. O teste do lembrete de 24 horas verificou a ausência de duplicata e a supressão após cancelamento. A conclusão clínica preservou o saldo importado e o pagamento pendente de uma sessão avulsa.

## Ativação no ambiente da clínica

- Aplicar [a migração de banco](../../lib/db/migrations/20261125_booking_notifications.sql) antes de publicar API e frontend. Ela acrescenta o telefone do gestor e ajusta o padrão de duração das novas sessões.
- Configurar `PUBLIC_APP_URL` com o domínio HTTPS publicado e revisar o retorno do Clerk nesse domínio. Um paciente novo precisa de cadastro vinculado ao e-mail convidado.
- Em **Configurações → WhatsApp**, conectar a instância, cadastrar o telefone do gestor com código do país e DDD, escolher as janelas de lembrete e ativar as notificações. Registrar a autorização do paciente no cadastro ou pelo próprio portal.
- Ativar `WHATSMIAU_ASYNC_ENABLED=true`. O projeto declara autoscale no Replit. Para processar lembretes mesmo com a instância adormecida, configurar um agendador para executar `POST /api/jobs/whatsapp` a cada minuto com `Authorization: Bearer <WHATSMIAU_JOB_TOKEN>`. Uma instância sempre ligada também executa o processamento periódico.
- Configurar o callback de entrega em `/api/webhooks/whatsmiau` e o token correspondente. Conferir no piloto, com números autorizados, a chegada da mensagem ao gestor, o acesso do paciente após login e o status **Entregue** na fila.
- Na tela **Horários**, **Copiar link de agendamento** fornece o endereço que abre a seleção de horários do paciente.

## Limites da entrega

O teste local usou PostgreSQL descartável, autenticação de teste e um provedor de WhatsApp simulado. A demonstração não acessa o cadastro da clínica. O recebimento em aparelhos reais, a configuração do domínio e o aceite da equipe dependem do ambiente publicado.

A consolidação de dados históricos entre gestores e a conciliação dos pacotes continuam abertas. O fechamento corrigido preserva a contagem existente. Saldos já incorretos precisam de reconciliação com os registros da clínica. A demonstração cobre agendamento e presença. O financeiro precisa de conferência com a clínica antes de servir de base para cobrança. Também permanecem no roadmap o parcelamento, o expediente configurável e a operação assistida.
