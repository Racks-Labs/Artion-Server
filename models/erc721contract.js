const mongoose = require('mongoose')

const ERC721CONTRACT = mongoose.Schema(
  {
    address: { type: String, required: true },
    name: { type: String, required: true },
  },
  {
    timestamps: true,
  },
)

mongoose.model('ERC721CONTRACT', ERC721CONTRACT)