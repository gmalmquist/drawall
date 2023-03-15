type Eid = Newtype<number, { readonly _: unique symbol; }>;
const Eid = newtype<Eid>();

type Cid = Newtype<number, { readonly _: unique symbol; }>;
const Cid = newtype<Cid>();


