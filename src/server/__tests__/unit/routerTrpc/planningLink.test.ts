import { beforeEach, describe, expect, mock, test } from 'bun:test';

const findFirst = mock((args: any) => Promise.resolve(undefined as any));
const findMany = mock(() => Promise.resolve([] as any[]));
const create = mock((args: any) => Promise.resolve(args.data));
const deleteLink = mock(() => Promise.resolve({}));

mock.module('../../../db', () => ({
  db: {
    notes: { findFirst },
    tickets: { findFirst },
    studyItems: { findFirst },
    planningLinks: { findFirst, findMany, create, delete: deleteLink },
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
        metadata: {},
      },
    });
    expect(result.accountId).toBe(1);
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

  test('returns an existing link instead of creating a duplicate', async () => {
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

    const result = await createResolver({
      sourceType: 'ticket',
      sourceId: 10,
      targetType: 'study',
      targetId: 20,
    });

    expect(result).toEqual(existing);
    expect(create).not.toHaveBeenCalled();
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
