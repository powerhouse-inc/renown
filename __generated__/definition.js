// This is an auto-generated file, do not edit manually
export const definition = {"models":{"VerifiableCredential":{"interface":true,"implements":[],"id":"kjzl6hvfrbw6caxaztbxanuw269278g4utqjbptpr8wkpr4ojeu8x0pyba85rie","accountRelation":{"type":"none"}},"VCJWTProof":{"interface":true,"implements":["kjzl6hvfrbw6caxaztbxanuw269278g4utqjbptpr8wkpr4ojeu8x0pyba85rie"],"id":"kjzl6hvfrbw6c9kmzznbi12dgqefcpoy9655y8ve05lxzagt82yknakq8bn0jms","accountRelation":{"type":"none"}},"VCEIP712Proof":{"interface":true,"implements":["kjzl6hvfrbw6caxaztbxanuw269278g4utqjbptpr8wkpr4ojeu8x0pyba85rie"],"id":"kjzl6hvfrbw6c8v7v1ze71nfvztk0hc74jzfsusg8hm4u1in4np2dusmi1dtrrg","accountRelation":{"type":"none"}},"VerifiableCredentialJWT":{"interface":false,"implements":["kjzl6hvfrbw6caxaztbxanuw269278g4utqjbptpr8wkpr4ojeu8x0pyba85rie","kjzl6hvfrbw6c9kmzznbi12dgqefcpoy9655y8ve05lxzagt82yknakq8bn0jms"],"id":"kjzl6hvfrbw6c9orwp76e85b3q5h4xaz44quw7yfcamb0ycdwg2c1ep9bxmfu5b","accountRelation":{"type":"list"}},"VerifiableCredentialEIP712":{"interface":false,"implements":["kjzl6hvfrbw6caxaztbxanuw269278g4utqjbptpr8wkpr4ojeu8x0pyba85rie","kjzl6hvfrbw6c8v7v1ze71nfvztk0hc74jzfsusg8hm4u1in4np2dusmi1dtrrg"],"id":"kjzl6hvfrbw6cb89wt03lz6plk9c9cufkwudia9bfvzlayht04qke7yotzac8f1","accountRelation":{"type":"list"}}},"objects":{"Issuer":{"id":{"type":"string","required":true},"ethereumAddress":{"type":"string","required":false}},"CredentialSchema":{"id":{"type":"string","required":true},"type":{"type":"string","required":true}},"CredentialStatus":{"id":{"type":"string","required":true},"type":{"type":"string","required":true}},"VerifiableCredential":{"type":{"type":"list","required":true,"item":{"type":"string","required":true}},"issuer":{"type":"reference","refType":"object","refName":"Issuer","required":true},"context":{"type":"list","required":true,"item":{"type":"string","required":true}},"issuanceDate":{"type":"datetime","required":true},"expirationDate":{"type":"datetime","required":false},"credentialSchema":{"type":"reference","refType":"object","refName":"CredentialSchema","required":true},"credentialStatus":{"type":"reference","refType":"object","refName":"CredentialStatus","required":false},"controller":{"type":"view","viewType":"documentAccount"}},"ProofJWT":{"jwt":{"type":"string","required":true},"type":{"type":"string","required":true}},"VCJWTProof":{"type":{"type":"list","required":true,"item":{"type":"string","required":true}},"proof":{"type":"reference","refType":"object","refName":"ProofJWT","required":true},"issuer":{"type":"reference","refType":"object","refName":"Issuer","required":true},"context":{"type":"list","required":true,"item":{"type":"string","required":true}},"issuanceDate":{"type":"datetime","required":true},"expirationDate":{"type":"datetime","required":false},"credentialSchema":{"type":"reference","refType":"object","refName":"CredentialSchema","required":true},"credentialStatus":{"type":"reference","refType":"object","refName":"CredentialStatus","required":false},"controller":{"type":"view","viewType":"documentAccount"}},"Types":{"name":{"type":"string","required":true},"type":{"type":"string","required":true}},"ProofTypes":{"Issuer":{"type":"list","required":true,"item":{"type":"reference","refType":"object","refName":"Types","required":true}},"EIP712Domain":{"type":"list","required":true,"item":{"type":"reference","refType":"object","refName":"Types","required":true}},"CredentialSchema":{"type":"list","required":true,"item":{"type":"reference","refType":"object","refName":"Types","required":true}},"CredentialSubject":{"type":"list","required":true,"item":{"type":"reference","refType":"object","refName":"Types","required":true}},"VerifiableCredential":{"type":"list","required":true,"item":{"type":"reference","refType":"object","refName":"Types","required":true}}},"Domain":{"name":{"type":"string","required":true},"chainId":{"type":"integer","required":true},"version":{"type":"string","required":true}},"EIP712":{"types":{"type":"reference","refType":"object","refName":"ProofTypes","required":true},"domain":{"type":"reference","refType":"object","refName":"Domain","required":true},"primaryType":{"type":"string","required":true}},"ProofEIP712":{"type":{"type":"string","required":true},"eip712":{"type":"reference","refType":"object","refName":"EIP712","required":true},"created":{"type":"datetime","required":true},"proofValue":{"type":"string","required":true},"proofPurpose":{"type":"string","required":true},"verificationMethod":{"type":"string","required":true}},"VCEIP712Proof":{"type":{"type":"list","required":true,"item":{"type":"string","required":true}},"proof":{"type":"reference","refType":"object","refName":"ProofEIP712","required":true},"issuer":{"type":"reference","refType":"object","refName":"Issuer","required":true},"context":{"type":"list","required":true,"item":{"type":"string","required":true}},"issuanceDate":{"type":"datetime","required":true},"expirationDate":{"type":"datetime","required":false},"credentialSchema":{"type":"reference","refType":"object","refName":"CredentialSchema","required":true},"credentialStatus":{"type":"reference","refType":"object","refName":"CredentialStatus","required":false},"controller":{"type":"view","viewType":"documentAccount"}},"CredentialSubject":{"id":{"type":"did","required":true},"app":{"type":"string","required":true},"name":{"type":"string","required":false}},"VerifiableCredentialJWT":{"type":{"type":"list","required":true,"item":{"type":"string","required":true}},"proof":{"type":"reference","refType":"object","refName":"ProofJWT","required":true},"issuer":{"type":"reference","refType":"object","refName":"Issuer","required":true,"indexed":true},"context":{"type":"list","required":true,"item":{"type":"string","required":true}},"issuanceDate":{"type":"datetime","required":true,"indexed":true},"expirationDate":{"type":"datetime","required":false},"credentialSchema":{"type":"reference","refType":"object","refName":"CredentialSchema","required":true},"credentialStatus":{"type":"reference","refType":"object","refName":"CredentialStatus","required":false},"credentialSubject":{"type":"reference","refType":"object","refName":"CredentialSubject","required":true},"controller":{"type":"view","viewType":"documentAccount"}},"VerifiableCredentialEIP712":{"type":{"type":"list","required":true,"item":{"type":"string","required":true}},"proof":{"type":"reference","refType":"object","refName":"ProofEIP712","required":true},"issuer":{"type":"reference","refType":"object","refName":"Issuer","required":true},"context":{"type":"list","required":true,"item":{"type":"string","required":true}},"issuerId":{"type":"string","required":true,"indexed":true},"subjectId":{"type":"did","required":true,"indexed":true},"issuanceDate":{"type":"datetime","required":true,"indexed":true},"expirationDate":{"type":"datetime","required":false,"indexed":true},"credentialSchema":{"type":"reference","refType":"object","refName":"CredentialSchema","required":true},"credentialStatus":{"type":"reference","refType":"object","refName":"CredentialStatus","required":false},"credentialSubject":{"type":"reference","refType":"object","refName":"CredentialSubject","required":true},"controller":{"type":"view","viewType":"documentAccount"}}},"enums":{},"accountData":{"verifiableCredentialList":{"type":"connection","name":"VerifiableCredential"},"vcjwtProofList":{"type":"connection","name":"VCJWTProof"},"vceip712ProofList":{"type":"connection","name":"VCEIP712Proof"},"verifiableCredentialJwtList":{"type":"connection","name":"VerifiableCredentialJWT"},"verifiableCredentialEip712List":{"type":"connection","name":"VerifiableCredentialEIP712"}}}