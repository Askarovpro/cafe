import type { Client } from '@b2b/shared';
import type { CreateClient, UpdateClient } from '@b2b/shared';
import { notFound } from '../errors.js';
import { id } from '../ids.js';
import type { AppRepository } from '../repositories/types.js';

export class ClientsService {
  constructor(private readonly repo: AppRepository) {}

  list(): Promise<Client[]> {
    return this.repo.listClients();
  }

  async create(input: CreateClient): Promise<Client> {
    return this.repo.createClient({ id: id('client'), ...input });
  }

  async get(clientId: string): Promise<Client> {
    const client = await this.repo.findClientById(clientId);
    if (!client) throw notFound('client not found');
    return client;
  }

  async update(clientId: string, patch: UpdateClient): Promise<Client> {
    if (!(await this.repo.findClientById(clientId))) throw notFound('client not found');
    return this.repo.updateClient(clientId, patch);
  }
}
