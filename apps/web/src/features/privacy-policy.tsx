// Política de privacidade pública. O texto é minuta até passar por revisão jurídica.
import { Link } from "react-router-dom";

export function PrivacyPolicy() {
  return (
    <main className="legal">
      <Link to="/">Voltar ao Ritmo 180</Link>
      <h1>Política de privacidade</h1>
      <div className="notice warn">Minuta aguardando revisão jurídica.</div>
      <h2>Quem cuida dos dados</h2>
      <p>A escola contratante decide como os dados dos seus alunos são usados e é a controladora desses dados. O Ritmo 180 trata os dados em nome da escola, seguindo o contrato firmado com ela.</p>
      <h2>Quais dados guardamos</h2>
      <p>Nome, e-mail, série e turma do aluno; e-mail e consentimento do responsável; atendimentos especializados informados pela escola; respostas, tempos de resolução, leituras e simulados feitos na plataforma; mensagens trocadas entre a família e a escola.</p>
      <h2>Para que usamos</h2>
      <p>Para montar o treino, mostrar a evolução ao aluno, à família e à escola, e melhorar as questões com estatística de uso. Não vendemos dados nem usamos dados de alunos para publicidade.</p>
      <h2>Alunos menores de idade</h2>
      <p>O acesso de aluno menor depende do consentimento do responsável, registrado pela escola.</p>
      <h2>Quem pode ver</h2>
      <p>Cada escola só acessa os próprios dados. O professor vê as suas turmas, a família vê os próprios filhos e a coordenação vê a sua escola. Acessos sensíveis ficam registrados.</p>
      <h2>Seus direitos</h2>
      <p>Na página Minha conta, o aluno ou o responsável baixa uma cópia dos dados e pede a exclusão. A coordenação analisa o pedido. Quando aprovado, a conta e os dados pessoais são apagados, e as respostas ficam sem identificação, só para estatística das questões. Para corrigir um dado, procure a coordenação da escola.</p>
      <h2>Contato</h2>
      <p>Procure a coordenação da sua escola ou o encarregado de dados indicado por ela.</p>
    </main>
  );
}
