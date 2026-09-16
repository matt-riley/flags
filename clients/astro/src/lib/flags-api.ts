export type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  applicationIds: string[];
  updatedAt: string;
};

export type Application = {
  id: string;
  name: string;
  slug: string;
  description: string;
  updatedAt: string;
};

export type FlagInput = Omit<FeatureFlag, 'id' | 'updatedAt'>;
export type ApplicationInput = Omit<Application, 'id' | 'updatedAt'>;

export const sampleApplications: Application[] = [
  {
    id: 'app-storefront',
    name: 'Web Storefront',
    slug: 'web-storefront',
    description: 'Customer-facing commerce experience.',
    updatedAt: '2025-04-23T14:14:00Z',
  },
  {
    id: 'app-ios',
    name: 'iOS App',
    slug: 'ios-app',
    description: 'Native iOS customer application.',
    updatedAt: '2025-04-21T09:35:00Z',
  },
  {
    id: 'app-console',
    name: 'Admin Console',
    slug: 'admin-console',
    description: 'Internal operations dashboard.',
    updatedAt: '2025-04-18T16:52:00Z',
  },
];

export const sampleFlags: FeatureFlag[] = [
  {
    id: 'flag-checkout-redesign',
    key: 'checkout_redesign',
    name: 'checkout-redesign',
    description: 'New checkout experience with a streamlined flow.',
    enabled: true,
    applicationIds: ['app-storefront', 'app-ios'],
    updatedAt: '2025-04-23T14:14:00Z',
  },
  {
    id: 'flag-billing-engine',
    key: 'new_billing_engine',
    name: 'new-billing-engine',
    description: 'Next-generation billing infrastructure.',
    enabled: false,
    applicationIds: ['app-storefront'],
    updatedAt: '2025-04-22T11:03:00Z',
  },
  {
    id: 'flag-mobile-navigation',
    key: 'mobile_navigation',
    name: 'mobile-navigation',
    description: 'Updated mobile navigation and menu structure.',
    enabled: false,
    applicationIds: ['app-ios'],
    updatedAt: '2025-04-20T16:17:00Z',
  },
  {
    id: 'flag-receipts',
    key: 'digital_receipts',
    name: 'digital-receipts',
    description: 'Send a digital receipt after a completed order.',
    enabled: true,
    applicationIds: ['app-storefront', 'app-ios'],
    updatedAt: '2025-04-17T10:42:00Z',
  },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createFlagsApi(baseUrl = '') {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  let flags = clone(sampleFlags);
  let applications = clone(sampleApplications);

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });

    if (!response.ok) {
      throw new Error(`API request failed (${response.status})`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  };

  if (normalizedBaseUrl) {
    return {
      listFlags: () => request<FeatureFlag[]>('/feature-flags'),
      createFlag: (input: FlagInput) => request<FeatureFlag>('/feature-flags', { method: 'POST', body: JSON.stringify(input) }),
      updateFlag: (id: string, input: FlagInput) => request<FeatureFlag>(`/feature-flags/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
      deleteFlag: (id: string) => request<void>(`/feature-flags/${id}`, { method: 'DELETE' }),
      listApplications: () => request<Application[]>('/applications'),
      createApplication: (input: ApplicationInput) => request<Application>('/applications', { method: 'POST', body: JSON.stringify(input) }),
      updateApplication: (id: string, input: ApplicationInput) => request<Application>(`/applications/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
      deleteApplication: (id: string) => request<void>(`/applications/${id}`, { method: 'DELETE' }),
      isMock: false,
    };
  }

  const now = () => new Date().toISOString();
  const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

  return {
    isMock: true,
    listFlags: async () => clone(flags),
    createFlag: async (input: FlagInput) => {
      const flag = { ...clone(input), id: newId('flag'), updatedAt: now() };
      flags = [flag, ...flags];
      return clone(flag);
    },
    updateFlag: async (id: string, input: FlagInput) => {
      const flag = { ...clone(input), id, updatedAt: now() };
      flags = flags.map((item) => item.id === id ? flag : item);
      return clone(flag);
    },
    deleteFlag: async (id: string) => {
      flags = flags.filter((item) => item.id !== id);
    },
    listApplications: async () => clone(applications),
    createApplication: async (input: ApplicationInput) => {
      const application = { ...clone(input), id: newId('app'), updatedAt: now() };
      applications = [application, ...applications];
      return clone(application);
    },
    updateApplication: async (id: string, input: ApplicationInput) => {
      const application = { ...clone(input), id, updatedAt: now() };
      applications = applications.map((item) => item.id === id ? application : item);
      return clone(application);
    },
    deleteApplication: async (id: string) => {
      applications = applications.filter((item) => item.id !== id);
      flags = flags.map((flag) => ({ ...flag, applicationIds: flag.applicationIds.filter((applicationId) => applicationId !== id) }));
    },
  };
}

export type FlagsApi = ReturnType<typeof createFlagsApi>;
