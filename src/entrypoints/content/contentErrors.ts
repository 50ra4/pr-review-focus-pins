export type ContentErrorSource = 'scan' | 'sync' | 'navigation';

export type ContentErrors = Record<ContentErrorSource, string>;

export type ContentErrorAction = {
  source: ContentErrorSource;
  message: string;
};

export const EMPTY_CONTENT_ERRORS: ContentErrors = {
  scan: '',
  sync: '',
  navigation: '',
};

export const reduceContentErrors = (
  state: ContentErrors,
  action: ContentErrorAction,
): ContentErrors => ({
  ...state,
  [action.source]: action.message,
});

export const getVisibleContentError = (errors: ContentErrors): string =>
  [errors.sync, errors.navigation, errors.scan].filter(Boolean).join(' ');
