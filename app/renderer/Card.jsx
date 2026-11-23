import React from 'react';
import { CardFrame } from './CardFrame.jsx';
import { CardContent } from './CardContent.jsx';

export function Card({ id, data, selected }) {
  return <CardFrame data={data} selected={selected}><CardContent id={id} data={data} /></CardFrame>;
}
export const nodeTypes = { card: Card };
