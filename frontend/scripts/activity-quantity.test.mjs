import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveActivityQuantityInfo } from '../api/_lib/activity-quantity.js'

test('Selo Vermelho legado usa PLTs descritos no item', () => {
  const result = resolveActivityQuantityInfo({
    atividade_chave: 'selo_vermelho',
    detalhes: {},
    itens: [{ opcao_nome: 'PET • 15 PLT(s) • EMBALAGEM MURCHA' }],
  })
  assert.equal(result.quantidade, 15)
  assert.equal(result.conferir, false)
})

test('Selo Vermelho legado soma as quantidades por item', () => {
  assert.equal(resolveActivityQuantityInfo({
    atividade_chave: 'selo_vermelho',
    detalhes: { itens: [{ quantidade_plts: 15 }, { quantidade_plts: 8 }] },
  }).quantidade, 23)
})

test('Selo Vermelho legado usa quantidade na observação', () => {
  assert.equal(resolveActivityQuantityInfo({
    atividade_chave: 'selo_vermelho',
    observacao: 'Item 1: PET • 15 PLT(s)\nItem 2: LATA • 10 PLT(s)',
  }).quantidade, 25)
})

test('quantidade registrada prevalece sobre a descrição', () => {
  assert.equal(resolveActivityQuantityInfo({
    atividade_chave: 'selo_vermelho',
    detalhes: { quantidade_calculo: 7 },
    itens: [{ opcao_nome: 'PET • 99 PLT(s)' }],
  }).quantidade, 7)
})

test('Repack legado usa quantidade de caixas na observação', () => {
  assert.equal(resolveActivityQuantityInfo({
    atividade_chave: 'repack_lata',
    observacao: '20 caixa(s) • LATA',
    itens: [{ opcao_nome: 'LATA' }],
  }).quantidade, 20)
})

test('Repack novo lê quantidade_caixas', () => {
  assert.equal(resolveActivityQuantityInfo({
    atividade_chave: 'repack_pet',
    detalhes: { quantidade_caixas: 13 },
  }).quantidade, 13)
})

test('Repack legado sem quantidade é sinalizado para conferência', () => {
  const result = resolveActivityQuantityInfo({
    atividade_chave: 'repack_pet',
    itens: [{ opcao_nome: 'PET' }],
  })
  assert.equal(result.quantidade, 1)
  assert.equal(result.conferir, true)
})

test('atividades com fator de meia unidade continuam corretas', () => {
  assert.equal(resolveActivityQuantityInfo({
    atividade_chave: 'amarracao',
    detalhes: { quantidade_calculo: 0.5 },
  }).quantidade, 0.5)
})

test('5S preserva cálculo por número de áreas', () => {
  assert.equal(resolveActivityQuantityInfo({
    atividade_chave: '5s',
    itens: [{ opcao_nome: 'Rua A' }, { opcao_nome: 'Rua B' }],
  }).quantidade, 2)
})
