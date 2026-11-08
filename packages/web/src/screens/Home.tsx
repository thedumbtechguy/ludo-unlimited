export function Home({ canContinue, onNew, onContinue }: { canContinue: boolean; onNew: () => void; onContinue: () => void }) {
  return (
    <main className="screen home">
      <h1>Ludo Unlimited</h1>
      <p>Ludo with Ghanaian kicks: Back, Line and Home Kicks, the wicked move and Labourer.</p>
      <button type="button" className="primary" onClick={onNew}>
        New game
      </button>
      {canContinue && (
        <button type="button" className="secondary" onClick={onContinue}>
          Continue
        </button>
      )}
    </main>
  )
}
