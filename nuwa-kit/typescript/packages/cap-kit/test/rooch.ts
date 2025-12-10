// class TestRoochEnv {
//   async publishPackage(
//     packagePath: string,
//     box: TestBox,
//     options: {
//       namedAddresses: string
//     } = {
//       namedAddresses: 'rooch_examples=default',
//     },
//   ) {
//     const namedAddresses = options.namedAddresses.replaceAll(
//       'default',
//       box.address().toHexAddress(),
//     )
//     this.roochCommand(
//       `move build -p ${packagePath} --named-addresses ${namedAddresses} --install-dir ${this.tmpDir.name} --json`,
//     )

//     let fileBytes: Uint8Array
//     try {
//       fileBytes = fs.readFileSync(this.tmpDir.name + '/package.rpd')
//       const tx = new Transaction()
//       tx.callFunction({
//         target: '0x2::module_store::publish_package_entry',
//         args: [Args.vec('u8', Array.from(fileBytes))],
//       })

//       return await box.signAndExecuteTransaction(tx)
//     } catch (error) {
//       console.log(error)
//       return false
//     }
//   }
// }
