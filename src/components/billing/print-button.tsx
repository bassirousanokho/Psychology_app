"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 print:hidden"
    >
      Imprimer / Enregistrer en PDF
    </button>
  );
}
