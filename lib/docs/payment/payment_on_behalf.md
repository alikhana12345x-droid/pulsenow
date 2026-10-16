
[TOC]
**重要提醒：**
当下单超时，或者返回数据为空时，不代表下单失败，不能当作下单失败处理。在网络波动，或者服务器波动时，很有可能下单超时，或者返回一个空数据，这时候必须把订单当作处理中来对待，稍后通过其他方式来确认订单状态。

##### 概述

- 代付下单

##### 请求URL
- `https://域名/api/payOut`

##### 请求方式

- POST JSON

##### 参数

|参数名|必选|类型|说明|
|:----    |:---|:-----   |-----   |
|merchNo |是  |String |商户号   |
|orderNo |是  |String(10,35)   | 订单号  |
|amount  |是  |String | 金额，如 900.00    |
|acctName  |是  |String | 收款人姓名|
|acctCode  |是  |String | 代付方式：EASYPAISA/JAZZCASH/银行编码(详见银行编码)|
|acctNo  |是  |String | 账户：Easypaisa/Jazzcash/银行卡号(根据代付方式填写) |
|mobile |否|String|手机号：当使用银行卡号代付的时候，必须传mobile，也是03开头
|currency  |是  |String | 币种  |
|notifyUrl  |否  |String | 异步回调地址。单一回调地址在商户后台也可以配置，如果需要动态配置地址，在这个参数传递  |
|sign     |是  |String | 签名    |

##### 请求示例

 ```
 {
    "amount": "100.00",
    "orderNo": "123456",
    "merchNo": "only",
    "acctCode": "JAZZCASH",
    "acctNo": "03123456789",
    "acctName": "James",
    "sign": "48418c2213eddf85f89c77471557de1a",
    "currency": "PKR"
}

```

##### 返回示例

###### Success：

```
{
  "code": 0,	//非0表示失败
  "msg": "代付订单已受理!",
  "data":
  {
    "amount": "100.00",
    "orderNo": "123456",
    "merchNo": "only",
    "orderState": "0"
  }
}

```

###### Fail：

```
{
  "code" : 500,
  "msg" : "error msg"
}
```
**重要提醒：**
当下单超时，或者返回数据为空时，不代表下单失败，不能当作下单失败处理。在网络波动，或者服务器波动时，很有可能下单超时，或者返回一个空数据，这时候必须把订单当作处理中来对待，稍后通过其他方式来确认订单状态。当返回结果是一个正儿八经的JOSN，而且满足code!=0才明确表示下单失败，msg会提示失败的原因！







##### 概述

- 代付异步通知，代付最终处理结果会以`POST JSON`方式, 通知商户在后台设置的代付通知地址。只有data里面的数据参与签名。

##### 请求URL

- `商户后台设置代付通知地址（首页 → 商户设置 → payOut_notify_url）`

##### 请求方式

- POST JSON

##### 请求示例

```
{
   "code":0,
   "msg":"success",
   "data":{
       "amount":"100.00",
       "businessNo":"8888888",   //平台订单号或交易凭证
       "orderNo":"123456",
       "merchNo":"only",
       "sign":"d6a7d013c500bf7addcc336cba5b5bb9",
       "orderState":"1",
       "msg":"accountNo error"   //失败原因，仅在失败订单出现
   }
}
```

##### 返回

- 商户需要返回`ok`字符串证明收到通知，否则系统会多次进行通知。


[TOC]
**重要提醒：**
当查询超时，或者返回数据为空时，或者返回数据不是一个标准JSON，均不代表下单失败，不能当作下单失败处理。在网络波动，或者服务器波动时，很有可能查询超时，或者返回一个空数据，这时候必须把订单当作处理中来对待，稍后通过其他方式来确认订单状态。
##### 简要描述

- 代付查询

##### 请求URL

- `https://域名/api/payOut/query`

##### 请求方式

- POST JSON

##### 参数

|参数名|必选|类型|说明|
|:----   |:---|:----- |-----   |
|merchNo |是  |String |商户号   |
|orderNo |是  |String |商户订单号  |
|sign    |是  |String |签名    |

##### 请求示例

 ```
{
  "orderNo":"123456",
  "merchNo":"only",
  "sign":"a43a19e73a2fd6cac1d85dd1dea3c5de"
}

```

##### 返回示例

###### Success：

```
{
    "code":0,	//非0表示失败
    "msg":"success",
    "data":{
        "amount":"100.00",
        "businessNo":"8888888",	//平台订单号或交易凭证
        "orderNo":"123456",
        "merchNo":"only",
        "sign":"d6a7d013c500bf7addcc336cba5b5bb9",
        "msg":"accountNo error",	//失败原因，仅在失败订单出现
        "orderState":"1"
    }
}

```

###### Fail：

```
{
  "code" : 500,
  "msg" : "error msg"
}
```
**重要提醒：**
当查询超时，或者返回数据为空时，或者返回数据不是一个标准JSON，均不代表下单失败，不能当作下单失败处理。在网络波动，或者服务器波动时，很有可能查询超时，或者返回一个空数据，这时候必须把订单当作处理中来对待，稍后通过其他方式来确认订单状态。只有返回结果是一个标准的JSON结构，并且满足：code==500；msg.contains("OrderNo not exist");才明确表示这个订单不存在！上线之前通过测试来进一步确认这个结果！





| 银行编码 |银行名称|
|-------------------------------|
|20|ABHI FINANCE SERVICES LIMITED|
|23|AFT|
|13|AFT IBFT|
|96|Advans|
|28|Al Meezan Investment Management Limited|
|46|AlHabib|
|72|Albarka|
|43|Alfalah|
|48|Allied|
|76|Apna|
|47|Askari|
|87|BOK|
|105|BYKEA|
|44|BankIslami|
|67|Burj|
|15|Central Directorate of National Savings|
|27|Central Directorate of National Savings (CDNS)|
|122|Central Directorate of National Savings (CDNS) – 1IBFT IMD Addition|
|57|Citi|
|56|DubaiIslamic|
|110|EZ wage|
|86|FINCA|
|97|FINJA|
|90|FWBL|
|52|Faysal|
|92|First Microfinance Bank|
|49|HBL|
|102|HBL ASSET MANAGEMENT|
|118|Habib Metro Bank – Bulk 1IBFT|
|77|HabibMetro|
|113|Humrah Financial Services|
|95|ICBC|
|75|JS|
|51|KASB|
|94|KBL|
|22|KEENU|
|24|KEENU Bank|
|14|KEENU – IMD and 1IBFT Screen Addition|
|115|Keenu1|
|79|MCB|
|100|MCB-Arif Habib|
|91|MIB|
|66|Meezan|
|10|MobilinkBank Pakistan|
|99|NAYAPAY|
|89|NBP|
|98|NBP Fund Management Limited|
|93|NBP1|
|65|NIB|
|88|NRSP|
|109|National Bank|
|114|Numbers Private Limited|
|55|PayMax|
|104|PayMax1|
|45|PunjabBank|
|11|SADAPAY|
|64|SCB|
|50|SEEDCREED Financial Services Limited|
|30|SIMPAISA|
|83|SIND|
|71|Samba|
|68|Silk|
|73|SindhBank|
|61|Soneri|
|58|Summit|
|12|TAG|
|103|TezPAy|
|60|UBL|
|85|UPaisa|
|70|Waseela|
|1|Waseela bank|
|101|ZTBL1|
|42|Zarai Taraqiati Bank|
