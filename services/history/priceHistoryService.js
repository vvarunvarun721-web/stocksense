async function getLastRecordedPrice(productId, PriceSnapshot) {
  const snapshot = await PriceSnapshot.findOne({
    productId,
  })
    .sort({
      checkedAt: -1,
    })
    .lean();

  if (!snapshot || !Number.isFinite(Number(snapshot.price))) {
    return null;
  }

  return {
    price: Number(snapshot.price),

    checkedAt: snapshot.checkedAt || null,

    platform: snapshot.platform || null,
  };
}
