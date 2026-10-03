import React, { useMemo } from 'react'
import SearchPicker from './SearchPicker'

export default function UserPicker({
  users = [],
  selected,
  onChange,
  multiple = false,
  label = 'Segundo ajudante',
}) {
  const options = useMemo(
    () =>
      users.map((item) => ({
        value: item.id,
        label: item.nome,
      })),
    [users],
  )

  return (
    <SearchPicker
      options={options}
      value={selected}
      onChange={(value) => onChange(value || (multiple ? [] : 0))}
      multiple={multiple}
      label={label}
      hint="Digite parte do nome e selecione somente quem participou."
      placeholder="Pesquisar funcionário..."
      emptyValue={0}
    />
  )
}
