function ScrollTable({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements lint/a11y/noNoninteractiveTabindex: Named scroll regions must stay keyboard-focusable.
    <div className="grid-wrap" role="region" aria-label={name} tabIndex={0}>
      {children}
    </div>
  );
}

export { ScrollTable };
