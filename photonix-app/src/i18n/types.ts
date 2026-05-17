// MVP4 §34.3 — supported UI languages.
//
// We keep the surface area narrow on purpose: two languages, one fallback,
// no plural rules, no message format library. Translation values use simple
// `{name}` token substitution.

export type Language = "en" | "zh-CN";

export const SUPPORTED_LANGUAGES: Language[] = ["en", "zh-CN"];

export const FALLBACK_LANGUAGE: Language = "en";

/**
 * The full key catalogue. Every UI string flows through these keys so the
 * type system catches typos and tells us where copy is missing.
 */
export interface TranslationDictionary {
  app: {
    title: string;
  };
  nav: {
    generate: string;
    library: string;
    editor: string;
    style: string;
    promptCenter: string;
    settings: string;
  };
  common: {
    save: string;
    saved: string;
    cancel: string;
    close: string;
    delete: string;
    edit: string;
    apply: string;
    copy: string;
    copied: string;
    confirm: string;
    yes: string;
    no: string;
    on: string;
    off: string;
    loading: string;
    retry: string;
    refresh: string;
    search: string;
    clear: string;
    reset: string;
    duplicate: string;
    none: string;
    all: string;
    favorite: string;
    favorited: string;
    unfavorite: string;
    source: string;
    description: string;
    name: string;
    category: string;
    tags: string;
    notes: string;
    language: string;
    auto: string;
    optional: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    pending: string;
    running: string;
    succeeded: string;
    failed: string;
    skipped: string;
    canceled: string;
    queued: string;
  };
  toast: {
    saved: string;
    deleted: string;
    copied: string;
    applied: string;
    imageGenerated: string;
  };
  errors: {
    generic: string;
    networkUnavailable: string;
    apiKeyMissing: string;
    desktopOnly: string;
  };

  // ─── Settings ─────────────────────────────────────────────────────────
  settings: {
    title: string;
    categories: {
      provider: string;
      editing: string;
      export: string;
      language: string;
    };
    provider: {
      heading: string;
      baseUrl: string;
      apiKey: string;
      apiKeySaved: string;
      apiKeyPlaceholderEmpty: string;
      apiKeyPlaceholderSaved: string;
      clearKey: string;
      clearKeyConfirm: string;
      modelsHeading: string;
      imageModel: string;
      textModel: string;
      fallbackTextModel: string;
      visionModel: string;
      visionModelHelp: string;
      visionModelPlaceholder: string;
      validate: string;
      validating: string;
      connectionSuccess: string;
      keyHelp: string;
      saveBeforeValidateFailed: string;
      saveKeyBeforeValidateFailed: string;
    };
    editing: {
      heading: string;
      proxyHeading: string;
      proxyHelp: string;
      proxyProfileLabel: string;
    };
    export: {
      heading: string;
      help: string;
      defaultPresetLabel: string;
    };
    language: {
      heading: string;
      help: string;
      label: string;
      en: string;
      zh: string;
      restartHint: string;
    };
  };

  // ─── Library ──────────────────────────────────────────────────────────
  library: {
    importFolder: string;
    selectMode: string;
    cancelSelectMode: string;
    selectAll: string;
    batchEditCount: string; // "{count}"
    batchExport: string;
    imageCount: string; // "{count}"
    empty: string;
    emptyHint: string;
  };

  // ─── Editor ───────────────────────────────────────────────────────────
  editor: {
    backToLibrary: string;
    noImage: string;
    goToLibrary: string;
    sidePanelImages: string;
    tabs: {
      prompt: string;
      mask: string;
      history: string;
      export: string;
    };
    canvasLabels: {
      versionFmt: string; // "{kind} version"
      original: string;
      maskActive: string;
      maskActiveSuffix: string;
      maskPaint: string;
      maskErase: string;
      maskReady: string;
    };
    prompt: {
      label: string;
      placeholder: string;
      preserveIdentity: string;
      preserveComposition: string;
      uploadProxy: string;
      generateDraft: string;
      final: string;
      presets: string;
      recent: string;
      saveAsPreset: string;
      noCustomPresets: string;
      noPresetsInCategory: string;
      noRecent: string;
      stylePanel: string;
      candidatePanel: string;
      candidateCount: string;
      candidateMode: string;
      generateCandidates: string;
      runningCandidates: string;
      modes: {
        natural: string;
        cinematic: string;
        cleanBright: string;
        moody: string;
        warm: string;
        cool: string;
      };
      noStyleOption: string;
      defaultSuffix: string;
      openPromptCenter: string;
    };
    candidates: {
      heading: string;
      runningSummary: string; // "{remaining} / {total}"
      empty: string;
      show: string;
    };
    history: {
      empty: string;
      emptyHint: string;
      versionsCount: string; // "{count}"
      kindOriginal: string;
      kindDraft: string;
      kindFinal: string;
      kindStitched: string;
      kindExportSnapshot: string;
      currentBadge: string;
    };
    mask: {
      brushSize: string;
      brushSoftness: string;
      paintMode: string;
      eraseMode: string;
      clearMask: string;
      showOverlay: string;
      hint: string;
      tipsHeading: string;
    };
    canvas: {
      invert: string;
      fit: string;
      noImage: string;
    };
  };

  // ─── Generate ─────────────────────────────────────────────────────────
  generate: {
    promptLabel: string;
    promptPlaceholder: string;
    sizeLabel: string;
    qualityLabel: string;
    generateButton: string;
    generating: string;
    galleryHeading: string;
    galleryEmpty: string;
    delete: string;
    download: string;
    apiKeyMissing: string;
    openPromptCenter: string;
    sizes: {
      square: string;
      wide: string;
      tall: string;
      auto: string;
    };
    qualities: {
      standard: string;
      hd: string;
      auto: string;
    };
    shortcutHint: string;
    quickPrompts: string;
    galleryGenerating: string;
    galleryEmptyHint: string;
    preview: {
      noImage: string;
      noImageHint: string;
      loading: string;
      exportPng: string;
      exporting: string;
      exportSuccess: string;
      exportFailed: string;
    };
  };

  // ─── Style ────────────────────────────────────────────────────────────
  style: {
    libraryTab: string;
    analyzeTab: string;
    pickReferenceHint: string;
    privacyShort: string;
    duplicate: string;
    delete: string;
    setAsDefault: string;
    isDefault: string;
    builtInBadge: string;
    defaultBadge: string;
    sourceManual: string;
    sourceReferenceAnalysis: string;
    sourcePreset: string;
    fields: {
      category: string;
      defaultStyle: string;
      description: string;
      summary: string;
      positivePrompt: string;
      negativeConstraints: string;
      temperature: string;
      saturation: string;
      contrast: string;
      preserveIdentity: string;
      preserveComposition: string;
    };
    categories: {
      landscape: string;
      portrait: string;
      travel: string;
      custom: string;
    };
    temperature: {
      cool: string;
      neutral: string;
      warm: string;
    };
    saturation: {
      low: string;
      natural: string;
      rich: string;
    };
    contrast: {
      soft: string;
      balanced: string;
      strong: string;
    };
    analyzer: {
      heading: string;
      pickImage: string;
      changeImage: string;
      privacyNote: string;
      visionModelLabel: string;
      visionModelFallback: string; // "{model} (fallback)"
      visionModelHelp: string;
      analyze: string;
      analyzing: string;
      extractedHeading: string;
      palette: string;
      warmCool: string;
      saturation: string;
      contrast: string;
      summary: string;
      saveHeading: string;
      stylePlaceholder: string;
      descPlaceholder: string;
      positivePlaceholder: string;
      negativePlaceholder: string;
      saveAs: string;
      saving: string;
    };
  };

  // ─── Export Panel ─────────────────────────────────────────────────────
  export: {
    sourceInfoFmt: string; // "{label} version" or "original image"
    presetLabel: string;
    formatLabel: string;
    qualityLabel: string;
    longEdgeLabel: string;
    longEdgeOriginal: string;
    borderLabel: string;
    watermarkLabel: string;
    watermarkEnable: string;
    watermarkText: string;
    watermarkColor: string;
    watermarkOpacity: string;
    watermarkFontSize: string;
    watermarkPosition: string;
    watermarkMargin: string;
    filenameTemplateLabel: string;
    filenameTokensHint: string;
    exportButton: string;
    exporting: string;
    introHelp: string;
    presets: {
      wechatMoments: string;
      wechatMomentsDesc: string;
      hqMobile: string;
      hqMobileDesc: string;
      smallFile: string;
      smallFileDesc: string;
      archivePng: string;
      archivePngDesc: string;
      custom: string;
      customDesc: string;
    };
    borderTemplates: {
      none: string;
      noneDesc: string;
      thinWhite: string;
      thinWhiteDesc: string;
      thinBlack: string;
      thinBlackDesc: string;
      galleryMat: string;
      galleryMatDesc: string;
      cinematicLetterbox: string;
      cinematicLetterboxDesc: string;
      squareSocial: string;
      squareSocialDesc: string;
    };
    watermarkPositions: {
      topLeft: string;
      topRight: string;
      bottomLeft: string;
      bottomCenter: string;
      bottomRight: string;
    };
  };

  // ─── Batch Edit / Batch Export ───────────────────────────────────────
  batch: {
    edit: {
      title: string;
      promptLabel: string; // "Prompt for {count} image{plural}"
      promptPlaceholder: string;
      pickPreset: string;
      styleLabel: string;
      qualityLabel: string;
      queueSummary: string; // "{total} total · {queued} queued · {running} running · {succeeded} succeeded · {failed} failed"
      cancelPending: string;
      startCount: string; // "Start ({count})"
      runningButton: string;
    };
    export: {
      title: string;
      sourceSelectionLabel: string;
      sourceCurrentVersions: string; // "Current versions of selected images ({count})"
      sourceFavorites: string;
      outputFolderLabel: string;
      pickFolder: string;
      changeFolder: string;
      noneChosen: string;
      presetLabel: string;
      filenameLabel: string;
      filenameTokensHint: string;
      moreItems: string; // "… and {count} more"
      onConflictLabel: string;
      policyRename: string;
      policyOverwrite: string;
      policySkip: string;
      borderLabel: string;
      watermarkLabel: string;
      queueSummary: string; // same shape as batch edit but with skipped
      refresh: string;
      refreshing: string;
      clearQueue: string;
      exportCount: string; // "Export ({count})"
      exportingButton: string;
      emptyFavorites: string;
      emptyImages: string;
      // Toasts and inline status messages
      pickFolderFirst: string;
      nothingToExport: string;
      doneAllOk: string; // "Exported {count} files."
      doneSummary: string; // "Batch export done: {ok} ok, {failed} failed, {skipped} skipped"
      unknownPreset: string; // "Unknown export preset: {id}"
    };
  };

  // ─── Prompt Center ────────────────────────────────────────────────────
  promptCenter: {
    heading: string;
    searchPlaceholder: string;
    modeFilter: string;
    categoryFilter: string;
    favoritesOnly: string;
    sourceFilter: string;
    builtInBadge: string;
    customBadge: string;
    favoriteAction: string;
    unfavoriteAction: string;
    copyPrompt: string;
    promptCopied: string;
    applyToGenerate: string;
    applyToEditor: string;
    appliedToGenerate: string;
    appliedToEditor: string;
    detail: {
      promptLabel: string;
      negativePromptLabel: string;
      tagsLabel: string;
      sourceLabel: string;
      modeLabel: string;
      categoryLabel: string;
      noTemplate: string;
    };
    modes: {
      generate: string;
      edit: string;
      both: string;
    };
    categories: {
      landscape: string;
      portrait: string;
      product: string;
      cinematic: string;
      social: string;
      illustration: string;
      interior: string;
      macro: string;
      editing: string;
      styleTransfer: string;
    };
    /** MVP5 §35.4 ZeroLu library category chips. */
    libraryCategories: {
      all: string;
      portrait: string;
      landscape: string;
      product: string;
      art: string;
      architecture: string;
      food: string;
      other: string;
    };
    empty: string;
    emptyFiltered: string;
    deleteCustom: string;
    confirmDelete: string;
    new: string;
    newPlaceholders: {
      title: string;
      description: string;
      prompt: string;
      negativePrompt: string;
      tags: string;
    };
    save: string;
    replaceConfirm: string;
    validationRequired: string;
    unknownExportError: string;
    // MVP5 tabs and sections
    tabs: {
      myTemplates: string;
      zeroluLibrary: string;
      favorites: string;
      recents: string;
    };
    hotRecommendations: string;
    recentUsage: string;
    favoritesSection: string;
    usageCountFmt: string; // "Used {count} times"
    usageCountKFmt: string; // "Used {count}k times" — for big numbers
    lastUsedFmt: string; // "Last used: {time}"
    use: string;
    useAndOpenGenerate: string;
    library: {
      heading: string;
      lastSynced: string;
      neverSynced: string;
      importedFmt: string; // "{count} imported prompts"
      sync: string;
      syncing: string;
      syncFailed: string;
      syncOk: string; // "Imported {count} prompts"
      syncWarning: string; // "Imported {imported}, skipped {skipped}"
      offlineHint: string;
      sourceAttribution: string;
      openSource: string;
      emptyBeforeSync: string;
      noResults: string;
    };
  };
}
