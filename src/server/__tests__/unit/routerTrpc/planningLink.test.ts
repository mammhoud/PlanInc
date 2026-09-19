import { beforeEach, describe, expect, mock, test } from 'bun:test';

const findFirst = mock((args: any) => Promise.resolve(undefined as any));
const findMany = mock(() => Promise.resolve([] as any[]));
const create = mock((args: any) => Promise.resolve(args.data));
const update = mock((args: any) => Promise.resolve(args.data));
const deleteLink = mock(() => Promise.resolve({}));

mock.module('../../../db', () => ({
  db: {
    notes: { findFirst },
    tickets: { findFirst },
    studyItems: { findFirst },
    attachments: { findFirst },
    conversation: { findFirst },
    planningLinks: { findFirst, findMany, create, update, delete: deleteLink },
  },
}));

function createProcedureBuilder(): any {
  const builder: any = {};
  const self = () => builder;
  builder.input = self;
  builder.output = self;
  builder.use = self;
  builder.meta = self;
  builder.query = (resolver: any) => ({ _resolver: resolver });
  builder.mutation = (resolver: any) => ({ _resolver: resolver });
  return builder;
}

mock.module('../../../middleware', () => ({
  router: (procedures: any) => procedures,
  authProcedure: createProcedureBuilder(),
  publicProcedure: createProcedureBuilder(),
}));

const { planningLinkRouter } = await import('../../../routerTrpc/planningLink');
const createResolver = (input: any, id = 1) =>
  (planningLinkRouter as any).create._resolver({ input, ctx: { id } });
const deleteResolver = (input: any, id = 1) =>
  (planningLinkRouter as any).delete._resolver({ input, ctx: { id } });

describe('planning links', () => {
  beforeEach(() => {
    findFirst.mockReset();
    findMany.mockReset();
    create.mockReset();
    update.mockReset();
    deleteLink.mockReset();
  });

  test('creates an owned link after validating both entities', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 10, accountId: 1 })
      .mockResolvedValueOnce({ id: 20, accountId: 1 })
      .mockResolvedValueOnce(undefined);
    create.mockResolvedValueOnce({
      id: 1,
      accountId: 1,
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'study',
      targetId: 20,
      label: 'evidence',
      metadata: {},
    });

    const result = await createResolver({
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'study',
      targetId: 20,
      label: 'evidence',
      showInGraph: true,
      metadata: {},
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        accountId: 1,
        sourceType: 'ticket',
        sourceId: 10,
        targetType: 'study',
        targetId: 20,
        label: 'evidence',
        showInGraph: true,
        metadata: {},
      },
    });
    expect(result.accountId).toBe(1);
  });

  test('links a ticket to an agent conversation', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 10, accountId: 1 })
      .mockResolvedValueOnce({ id: 33, accountId: 1 })
      .mockResolvedValueOnce(undefined);
    create.mockResolvedValueOnce({
      id: 5,
      accountId: 1,
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'agent',
      targetId: 33,
      label: '',
      showInGraph: true,
      metadata: {},
    });

    const result = await createResolver({
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'agent',
      targetId: 33,
      label: '',
      showInGraph: true,
      metadata: {},
    });

    expect(result.targetType).toBe('agent');
    expect(create).toHaveBeenCalledWith({
      data: {
        accountId: 1,
        sourceType: 'ticket',
        sourceId: 10,
        targetType: 'agent',
        targetId: 33,
        label: '',
        showInGraph: true,
        metadata: {},
      },
    });
  });

  test('rejects a source entity from another account', async () => {
    findFirst.mockResolvedValueOnce(undefined);

    await expect(createResolver({
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'study',
      targetId: 20,
    }, 2)).rejects.toThrow('ticket not found');

    expect(create).not.toHaveBeenCalled();
  });

  test('rejects a target entity from another account', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 10, accountId: 1 })
      .mockResolvedValueOnce(undefined);

    await expect(createResolver({
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'study',
      targetId: 20,
    }, 1)).rejects.toThrow('study not found');

    expect(create).not.toHaveBeenCalled();
  });

  test('reuses an existing link and syncs its graph visibility flag', async () => {
    const existing = {
      id: 7,
      accountId: 1,
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'study',
      targetId: 20,
      label: '',
      metadata: {},
    };
    findFirst
      .mockResolvedValueOnce({ id: 10, accountId: 1 })
      .mockResolvedValueOnce({ id: 20, accountId: 1 })
      .mockResolvedValueOnce(existing);

    await createResolver({
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'study',
      targetId: 20,
      showInGraph: false,
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: 7 }, data: { showInGraph: false, label: '' } });
  });

  test('deletes only links owned by the requesting account', async () => {
    findFirst.mockResolvedValueOnce(undefined);

    await expect(deleteResolver({ id: 99 }, 2)).rejects.toThrow('Planning link not found');
    expect(deleteLink).not.toHaveBeenCalled();

    findFirst.mockResolvedValueOnce({ id: 99, accountId: 2 });
    await expect(deleteResolver({ id: 99 }, 2)).resolves.toEqual({ success: true });
    expect(deleteLink).toHaveBeenCalledWith({ where: { id: 99 } });
  });
});
