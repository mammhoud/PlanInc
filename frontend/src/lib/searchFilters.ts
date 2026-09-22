import type { PlanIncStore } from '@/store/planincStore';

const SEARCH_FILTER_QUERY_KEYS = ['searchText', 'tagId', 'withoutTag', 'withFile', 'withLink', 'hasTodo'] as const;

export const clearSearchState = (planincStore: PlanIncStore) => {
  planincStore.searchText = '';
  planincStore.globalSearchTerm = '';
  planincStore.noteListFilterConfig.tagId = null;
  planincStore.noteListFilterConfig.withoutTag = false;
  planincStore.noteListFilterConfig.withFile = false;
  planincStore.noteListFilterConfig.withLink = false;
  planincStore.noteListFilterConfig.hasTodo = false;
};

export const getSearchWithClearedFilters = (searchParams: URLSearchParams) => {
  const nextSearchParams = new URLSearchParams(searchParams);

  SEARCH_FILTER_QUERY_KEYS.forEach((key) => {
    nextSearchParams.delete(key);
  });

  const search = nextSearchParams.toString();
  return search ? `?${search}` : '';
};
