import { visibleLines } from "./tiers.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Contacts/doctors/medications are typed as free-form text (one entry per
// line) rather than separate name/phone fields, to keep GHL setup simple.
// This finds anything that looks like a phone number in that text and turns
// it into a tap-to-call link, so we don't lose that usability even without
// a dedicated phone field.
function linkifyPhones(escapedText) {
  return escapedText.replace(
    /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g,
    (match) => `<a class="tel" href="tel:${match.replace(/[^\d+]/g, "")}">${match}</a>`
  );
}

// Renders a free-text field (contacts/doctors/medications) preserving line
// breaks, with phone numbers made tappable, but only up to what this
// profile's tier is allowed to show — anything beyond that is still saved
// (visible/editable via the edit link) but gated behind an upgrade note.
// Returns null for empty text so callers can show an empty-state message.
function renderTieredBlock(text, tier, field) {
  const { shown, hiddenCount } = visibleLines(text, tier, field);
  if (!shown.length) return null;
  const block = `<div class="textblock">${linkifyPhones(esc(shown.join("\n")))}</div>`;
  const upsell = hiddenCount > 0
    ? `<div class="upsell">+ ${hiddenCount} more saved on your account — upgrade to show ${hiddenCount === 1 ? "it" : "all of them"} here.</div>`
    : "";
  return block + upsell;
}

// Site logo, embedded directly so no separate image file/upload is needed.
const LOGO_DATA_URL = "data:image/jpeg;base64,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";
const FAVICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAhKElEQVR42qV6Z3hdxbX2zOx+elE96r1ZxXJvuGLTjE2HYCC0i7lJSCChhcBHu4EQSggJJZRLgACmGRuDATdsY9mWbVmyZUtWl47a6f2cXWe+H7KkI9nk3uf79g/pPHvvmb3WrHeVWfNC2lYLIAAAgPF/SReZdhMCQs7z5sRr5HyTTJ8KAkDAv7vOeeHc+cm4LIQ++zo898M4SRoyMXhchwk1yPiU/0b6KTqT8zwjZKrY42/DqesFx8WAAIzJDOnxF0jSx8+KmCTr2Agy8b2pksBxDQGAEMLzmijpPyFjkiXPM/4bnn08PmfSRBNDSLJi9LRvkJ/U/jwrSM4+hRBBCAHRiCZpRMOAAAARQBRACAACMAAYA0wABIBGNAshBSEhBI99ACZ9dspfkqRAkjAkeanpZNGTAAinAm5yfaaIDgFEFFY1NSYDSHM2q7k4w+DI0KVaeLOeYikAMICYAgTLshSJxj2B8JAvNOiVfBGAMdJBmoYEE0DQpA0nMQngORYcu0kggQSOiQlpe+3EMDLdhyBM8pdxBcZHIqSKClGIzpGVPqs2fUY5reOUaDjmdoUGh0Z7nUospmMZiqbiksTouJTslNT8NEO62WDVKzFx5ORgf2Nv1OkDDGEFRDAmZAJIU/yZgAlQnsXVGMbO3mfstUlwPNf54biDTioGKVqTNSxr9urqoktWGzJSPadPd+z5QR4eJT4/IIrJnnrfr2+1260vv/YBwzC33LDW4wns3nu4pblNMBkwTYQ8W+WKqpwqR2gk3Pxl63CTE7CE5QDR8Pn8HCaZnSQhCQJA6H8TPeA0ZBEIESCQUiKipbyy/GfX8ybdic8/9x9sNNDoP266fOHiuQRRv73/6VdefqKnb/DAkWZNVVevueCii5d9/NEWAtSNv9qw4fq1C+esX7Nk4c5/HPgxHspbWbbynoXxUN3+N464Tw4zZhoAFeBkrMMk/0gOHmfRgeB0jeE5djgbYiFNaSoAgJtx9y/nPfJg4MSxH+65d7Wd/+0vb9TZrI8/+bunnns9zW6+8KIVOVnpDz324s59R65Yt0on8MOjHkVRTp7pq6+pnF1Xtf7Gyx/5/V2Ig/MXzK6mc9+/9YPufaeu+fPKCx9ZhgmnSBSkIAB4Yo2T0EGmhhACAKAoXfpP5h44hiFIAIA0o8QVc3H5vMefREDbe/99vsbdX3z530VlJW1tnc3NrTUzylavWlxbU/HWu5viCfGpR++5ePUSRSMAkMKCnOEhF+C4q9eteur5N95+5YlPv9wh8OyLzzxoTzH9/Ob1f3/svWNftc68snLhnXVDLd6QM0HrIMEYToAHngckY/copMs4bxobS25nQynFKHElZ/XFtb/5nXPrpy0vPPPk4/c6vQleEBbNrfH4Al0dHaUVpZKsPvqHP9dXl77w7Esdnc6jjcfffGtT0/HWpiMtYkIaHRzp6xt8/90vbr/j+k82b//5jVfc88Czf3/h6UAYVM+tWrN00Vv3vxAV0dUvXBTzi8NNPlqHANYAgOAnE+S4E/9EfhxXhOJUUSm67uaCy686+Ohvos37ARAONm6zWS1V8y5vO7L10y07cjLTnn/uVZ8/OBhKGEuLHTNrsc3O2SyWNBvGajwUjI6OqKMjwfYupX/YwrI+l/+JZx/OyrS//fane77feeMdNy+aX/fmPz7kOZNTGbz27fVH/nl6/yvNrAkTVT5H/ilJnaJ0GT+d/89KX3LTnbmrL9u98WcXlDoeevT+kVGvzqhPsZurqyve+3ibAZGnn3sj4sixXX1jzW8fKFi7js/J4XkOSXHR5VbDIY5lUgpyHIvmll5zSc665UxuClalr9/7Ijcr+4LlC7bvaJg7t+6uW68pLMrrHx5s/L75zO6+NU8tNliFrj0jtAAn7DCtoCBJFoDjlc9UO1CMKqr5V/0s99JrGh/5zywSAXrzyYbPDx09abea7nvsRTvPbtr8vVBXX3H7L1Iqa6I9Z4Z3fh083pgYdUmBMJClpIKKAoLeXJzlWFyXf9EiXaEj0tF5/G8fefYc5UwpBw98+uJf3/3g7U8AzwEaCYhPqUi56r01ja+dbHi9lTVqRFUBnBbq4dkAw9jrpkJo/AdFq6KWsWRFxcYHDzx895oS6/pr12+8/dcrLlr90L23/er+Z/s6OiM0O/P+x1MXrvQcPzzw8Vv+ww2AYRBnBpJsTBdSq9IsxRadXYAaTrhiwR6/67Qn6PQDgBzLaqruXG+dXerbe/D037/SSUz30BCnEySXd9W6C19+/vczKi+1z7Hf9um1X9+3/9S2XtagEhUnCQ/HEu80BUjyG5oGDbmFNQ893/nZO6ldhzd/+c7j//VKdWXJiy+/s3HjhtdeeYcUV1Xd96SkYue//ja09VNKZ7DNX8UwgtHmT19sTql3sFYW0oAChKGhjqcYoqmuqP+458xXPS3bOtREovjq+dX3/UzD0rHH3xptcAKKXHvVRS/96eHVa2/NyXGMOgNkLrrgvrkfXfOdu8vHsCrBExXG2ZqUADCmAJkGHgJpSHNVv/0jVqTWZ++1Go0vvfCHq9auunnj7++6/fp1a282L7+s5K6HI12nel59KnymJe3Ca+3zLsbeI1mzE3qH4DkxEmz3KgEtPBqAhFgzrXorSiky5i7JS6/NYCDxHHH9+Epzy9Y2W3Fa/RPXW2eWtv3pw/ZPjm/Z8tozL/xj+aLZTz7665s3/v79N169fuvdNEN/ctMuDERItHMhRCFdBpzm44jRZDXr4qstMxd3v/6U7HOJBH7xyTZ7uv2+X/38huvvJrOWld75iO/ovjN/fkD0+Up//ayhch7r3pxdEurb1d3+0UBoxBYYBaO7GooK642s7fR3B8N8iXdIaP+sbWRHGyegrKXZlWsLUjOtJ7Z2Dn57zFZozr1pJR0Nvnjvn55+5mFHRppzaPijz7dfsGBRw1ctM++uhiLuP+imeZBc4J8t3+lxCMEx14YQa0SXmVf2uz/79m0d+eE7NrMgcWo/YASNYIfFEM0srrz3mfDpI2deeAjRbOFv/oRYgTS/CtTgcAfPFc0EnCIP9dkVceHVV5TedCNAoPPDTT9u+izIsHxeviaTREtzRQ1zwUNzdEWGwR3DmzbulGKJJS9ea5pf3vbYpshRD2XVfff56xCi7/Y0/Oaue5f/cV3JlUWfX7PT7/TTtEYIHI9Ek4lssgSHCBGVZK+/mU3JGnj/z7LPZZy7Vho8A+QEJETUmarufSbhGuz8y8MQMcX3/wUKFvdH/yfYN+J2p/BFRcqZY0bXYP2KlUsffQpW1H352BMt23dV3XpX/forqEDAvXt3zDWsq6vuaXK1fXg0uyIt8+KcsoV5p7b1One2OhbmZ11U2/jB9xcuWnLF2pW3/sf9X23bfevtt2z/cE/5deUGI9e9a4jizhYIZ1MzIRMKnC2PNEXT5xZnrrvV37A93NdrnHsZbcvg86pkVy9JREo3/gGa0vrfejru7Mu+ZqMYx0MfvxBuPUkRXXahIzsjZeaG26p/9wetpObQJ5v2/P7+0QP7/a2tJzZvDipa0fUb6u+8PT2/VBkaYVno6XO3b++OOX0iDwprM9u390fanRmX1jhmZB96d8/+g8euveKiRx76xZw5VUf2tQ76XdXXV/TvHop64xQ1pfpMVgBAhIiqpa9cL+SWjXzxuhz0I4pKtB2ADEdUYMrPs6/e4Nu1yfXdR46r7o6PDsFTO8tWX1p+w52FN9+dvm4DM3vZkMvf/N7bTX98dHT7F1o8StssvJ5Vo4Hh3TtPf7HF1d2rK6/KuGC56PEZzEZLcaXGV7W/fxoz0fJVBa2fndDzKPu6Ob0HTpRb8gtL8iKR6JPPvXbLDVd+/N435T8rJ3F14ICL5iBJjpdjPjCxU6BNlqK7n1b8o85P3mALaqX+FhwJaNEgxQklD7xMEOp+/jeUzpzzi2cH33mm/lf3ajMuCLefiPR1Rk8di7c1yyP9OBZLKS2d+eCjcW/Qe3ALs2wBa7HCiKvjlQ8jHUOA58z5BVXXXm9yOLr37Cq46XYmKjX+9e71f79o83XbI+7w4revpQm147Z/4ZDvihuvazrRHvCHwoHQZf+8xJhm3HLTLjEaQ3Byk40msxeEWFUM+eWUJS3a2aIE3ELZPNPSG80X3sFkVRjKq1lHUfDwDtkzbFtyGaZ4CqgKoxv87stTv1g3+PIjwe8/U1xOSm+AHJdzyTqpqo5eVZ921S2ho6OhaCouuzBjVT0ymADB6XX11vIZzsYj2WvW9u/YmSAUrUFsZqpvLJMCsdEtrVyxPX9xPuJMPX3Ot/76+Htv/jE/M6N3R78h35RZY8cSgSgpZCYnLwiRUFCJZSU+0KEFh/yfP0cUJX5il+rqtsxZI3lHA417uKxivqhOC/mIGCOcjiSikKIoo5UyWiDLAUIIxjKg1EjM9+ZzTCkqvLgy8ObLolcErIDFOADEXDeHyi/JvupGT3ubIitQb5C8SqA/bF/mMOWl9XzXGR8N2pYW8Rz3+suPv/b2pi1f7/6vpx8YPjoqSWrG3FQAUHL1nKQAxrTeyGUUyAG37HObVt5mXLZBC3uxnKD1OiG/KtFzShzuM5TNpMzpYk+L6BrANEdUFQAIiAYAgRBCiCBFYQ0TVte/o737D89kLDDNfvCSwPbNSoKwBn7+y+9oAOz/z1tO/P2F1peehZwAKODvDw3uGNDlmHIWZSZGw5HjTkO1w+iwxKOJLz75+sNPv83OTsUeKeSM2KvtrIHF2mRXYlIBommMJYU2pSj+ETUWRXozpTchhsayzDkKIaePdbYAiLjsUqCqie6TGBNVwwAgQAhRNTUa1uJRLR4hibAsiVgGtMXQ/33z0fv+lruQXrBeH/rxaNaGB0aOtzU9eE/geMvIru8BwYTWybIGIBk95FYkzVJnBxB5jziFVGOEV77auvtQw+eHd/3rm537Q4NeaSguOIzGNB1WyYQN6An8EIwZaypkODXkVaPByA/vI1Zgc8qBpnDpeViRE4NdlMHMpuaq0YAa9unySmO9Z8T2o5DjGJM5fc2VANEQIqDJVG61HAgxqvbBVx+Fg9IbT7278umF1leWDx5qjI+OFj6yEovk+ObOqCcktu4K2szGopKoW464IsYKO2UQ/O0eOS5mzSr4y4tvHm1rB4D8eOAYZHXh/qB1drrBofP1+gF7tvqhk9txtMlGAFJCPgAhQYwSDmpdx4kisSnrtHhYDrhpsx1rMNHRjASeyy0OHd7nWLJCGugw1i5jy5YijkYciwGhDMLwZ//t6+/jaxbwkLTe9YDsD1384nJLcS5ki6W4jEwMZWaPvHtizlq+cfsBfXGJ5BoabXDaarL1Gbq4K6aGRD7LTOl1P+4+BCQZWcyYKHFXHNNQn64DeNJv6SR/hpTORFRNi0WImDBX1hnyiz0Ne5SgF+nMaiRCFAVLcvz0DxCrACPZM6KG/NzlV/NpGbKoMdFg4Ov35GCA1hnVaFAnx668dMVbTz8Tjkur7rndpdlavtjTv2s40BVgeCpnRT6PiCnLqHNYY53HiD4DUXzsuDt2Oi4GJaISOSjSFh1WsD7DXLA4y98fGT4wKIUkjQDexid33CZbixBCxPKAECXotc65oOA/Hkz0taWuWHvykbsApLAsYjEh5JdZ5yxFRFXjonf3l4jn/MeP6nOLon4VQsha7ZBltYA/3t/3wbZ3r1izpOHoqb90iZHaWdLhdt+h7T63rJmMRgcfyq5tefWbGWvS+w6PCKYEgoP5FxXnz62P+GLuNq//pIeICqApRk+venmlPV8fHYjtewYnfAmMAW1gxlsqUyAEAYAEY4IxUWTDvFWhjm7XlvdLn/yHvrBSS8QpQT9W/YnOPi0RY8xGoaBYl1MWPH4Ai2E5IrFZVchopyleTahQxzlKy74+2PrXl17vjABpcdhm0w0ddiqE1ucYKU6ls+z2FdWDB44x6WklV1SGekJyIn7q+/7MBVlnW1CEKDHVWp0aw7DlscNFN5SmXpAdbHJpGEAGTSpACJ1cSWvxCNE0QLPRU01cajZkON/e3ZJnWK8qAECKF8ThgZjtDFY0+kyTqTBbAzO59Gzfkb2Vl5gjgW/dDc1EFWmBB+HYm29vnrlsQeOhJhOH4IxVnuMN4a5+LjU1dNAtW+mU1TJnRCMBQ0p1FWMa7OuziXsHs2fEo+5EpD9KCzRBFFZJdCjas3c4qhDFkTL6zzYDR2EMkusIAuCU7rQaCRJFpY22QMM2y5zV+pLZ3l2fSi6nJsYgxUGGBZiwOdVYxVq305DG9+zdbFtyoa50IUrpLb2roPg2ByPQFCSqM7r3vS36nOJrH3nky93tlNdvwUfyXtkYwGYEASZAZC2sGLTMms8X1nZ9sRMYV7C6gdRVJUjgR/YNYEQDXlAiwVh/yLOv17a0sP3lRs/OPvstVZpGVEmb7BfCCQgRABBUAh6iyLTOBGkqeGwn0DTEC5BmFL8LFM+mTXbR2anFwkJhna9VrxFZHDiJhKsNFXUdH2xTkYAMFI4rAADzrNTyJ+bte+Ot8tm/MGcXuba+UPOXJYMjmtbeiWlIABSIMvL9iZRrr2H0+t7GWMalRpWPG2fm+A84E+6YudRCeCExFIEMEofF/tcaKQYCCnJWQcNEiSgAk3N9gCBEKyGvGg3RphSAiT6vzDZroRzwuHZslr1DRCOsPSvec0p29fJZ5ciYFXO326uzA4f2OK77pY8vPfHUbgA4U5W94KqKtqdP5dxUYN5QePT1F7u/6LDXmCUdR4639LzaxJg5AKASi+tLanXFVa4PnzeVV8k+n7GIlzUYbHEDRdXn2TBhE/0+oKr2OQvNM+oHPn5DdPm5dL0mk4RfSt4Ao0kIIaTFQ7LXSZnSECsAokGOAYTQRpvqH9IiPs5RDBlWGu1Wgj5dfrmvU7XVZMbaDwUOfKvPEWzzc9MuLKh+YvnI/k6ZrRz4RAmcDKTdMdOx3CFHsRTHKmSgTgC8QFiONupTL9mgeIYCR3bqy+qVoVbLkpLYUCTQ7AI0MpQ7pIAiueOAAoIjRwkE5EiMNXJsml6Lq6InnlwAJdV1WEM0o/ickDcy9vT4YA+ElLGwgjaatERE9vSzaUWsLU32DMruHqQzE74o0u+xVtljbZ9nXmxIWVJY/Ms5J5780b3HSXMKylnU92Zv4OSI/dYFWRdkJcJY1chYZ1+Lhc2zLuQLq12fv2ooqYs7h0zFGOakh4+MhDsDQqaeL8qJtLnVGBGycuWAL9rfgROywWFEdr0SlKKjMUhDgs8p5gjWAKJJLEhkkUvLAwRHWptF94jgyNZkRfEMAUDr8muIKif6mtRIUFdc62vTGDNrX1oijiYi7b7wYDza5aEsPJYIkONU9tLRTb5otwstq4nHIcYQQqQlwsaKBdZlNwR/+EQc7NaVzMMjh82X1MVHor7dPVhS7fU5WLBJXX41FmFMVt6ersXCRJYtpXaiZ+XRaNwdp6jzWABACLEkAoA13wCfW4kVVQoH5JCXEgysLV0c7lB9g7rSeYwlVRrplQdbCWZ0FSs9B4e9uzriXpkrTXPv6uPS8wAm0vAZnAhCBhFLXeDbcKS5j/hjoeMjRE0YSubaVv5c7G0OHPjatmht6MCXjmtnSLwhtq87dNrLpXKmeTMiXSHFp0IGGvIK5YA/NtAHacpcnaoRGO8KylF5Yj9ApuUBLIuaKmsxH5NVyafnJga7aZ3OXFQZH+hOjPTqg6OsudZQMS/Y+G28+wgypCJDuqFmZfDAV7TNBChVHrHYVt4Wbd0ba9+jNPwL8QaIkCbjaHscUViVoHneJcaZa8S+o+GmndbFVwYbv3Vcmi7m5YLOYc/3nVjT0pdVKfoMuaU/5uxjbWmEYcNdJ+VA0Jhj5YrtOKYEWr0AEpB00DtlTwwgxBrW55VqioZYLt7VzNrShex8zpaixeOix8mn57NphVpwWPIN45iXtjiQkMKmZojOTl2unmgiFhFXVE8ZM3A8pIY9WE4ALBMAkCHTVH+xrnSu6DwePdWgK6z0N+xIX2oD82vJqNf7UVPcFTOX2WyXLo85VaXbHTlzNHXBCsGeFj7TInsDuRcXc7NyteHwwBedhKjJAk/b1FNqLGzIrwBKgrJkSq5eyTOsxcJpS9Zw1hTvwW8hw7MZ5WxKhjzSpYZ9OOKmTOlQSEW69HjXCKJj8Y6jWjTAF9azGVWI0RMlgTiDUDBPX30hZTJFm7+KndjL2B2RU6eslbz+8nl4xOf/uCnqjHAWOvvG1THZDgeCnr3bucxcc/Vs2eP2nzzKGnX5G2o0gy52YGD08DDNTmkjTrUAIBAAVUxYahZInlEkmFRPN8Aq0RCTlmEqrfM3fA0A5rJqWHuaNHhGi4e10DDSmWhDGm3N1eIMwVge7pKcJxAD2OxKNqOKyShnbKmK53SkcbM02MGk5BFiss2yWa+qTrSN+D5uio3EGB3MvWG5qC+i/ND97RbIopzLNmBR9B7cpsa17KV5/PxCGBWdm9rkiAgh/sm2ypgRlKBXyC1nBEGTJCXoZwwgPuzU582Ith+Xgz4lMAQ0lc+dyaZlyyMdWjyiBgYhVii9lbZkUuYcxpYLISW7+1R3F4QyjrkSHQ2ye4C2FQplq1hbun2mZJxj9X3X6dt2SgrJrInJvnqpmjELRlj3J28jmsq98naAsefHbQBHIKEK7pgtsZx8fGho1wDNkelHAGj6AQcBFJK9w5Y5q2XPAKA4cWTIUGANNDXJoUDeDXexJrtnz6dYjvFFc/j8Gaq3Xw37tKhHCw0DLCNej/RWyprDpJZC1qy4erVEnM2dJRTOpfUGlnGaC0bVRHzo49ZI6yjWNEO2KfPK1ThjgTYYdH/yBm00WWcvYi0294EdtDES7YkUXl1ByrKYhNj/QasSk849Dj5XAQAh0uIRgJCh+gLF3adGYloiqsvXy37FVrfAd3QvIRBBMXxiL5dZbpy5CiKg+Ia1aFALjar+ARz3ECUKsYw4jknJoowWEveJ/cewtwXInsAJv//QkBYXKR2yza2wX361SpXGjzT6tv9LX1Bir11Acbxr73esxR9zxi15RvvV9YoGYvu6Rw8On7v8k42t6UZAFEBU6ppbKcEUPvhltOuUvjiNd+h9+/v5tIzc6++I9pyJtDcnRgaolCLzvEuAKsXPHEr0ntRiIUAIoChI0ZCmxxI8wRoACACkiQoEGmMW9KXFlnmLkK0w1uGMNf0gDneaqmanL17jP9YQOnXCXGuMD4bk4VDV4xeGaL3O7297qZFgBRB87inYOT4w0XrHWPEOCQV1TFouDg1GO3oZo9k6NzvS5oz191gr6yBCfKqDSMHggS+JRoSS2frK+Wx6LsXxgBCiqURRiKYCjAGgIE3TRr2+MM+6YKFtxcV8QU3CGfJ//1Xk6HeSdyTr8ptTZi0OtDb5Dv5gnmNVwkrk5Ejlg0tDgkUPpP53msVAHCF8/pPKaRaY3KtBRDRNV1BlnH05ESORpq3RtpOGqjzzzEzv7g6g6kxlFfqsnKiz31Qyw9e4O+EehIKNz6ukLamU3gghJqpEsAIpCDmWEgTIskBVZI9HHOiXB3uAEmVSHIb80vCZE1xqJkhIkcG2tEsqEl3BcJOz8sHlsbQ0jsGBz1tGG4YYHSEa+fcKkKSe+zj1A1FE0wyVC3Qli4kqJrr2h47t4xypqasrIicHQk0DdE6+vaTGmJuX8HlowSi5nOHOFqJijAGgKMgbEMsBBLEsEzFOVBlBhGgIEbRWz486uzNWrVO8rrjHPbL7ayFDSF1T6dvbK/d5y363NGZLYxiS+KF98JtuWgBE0yYP+aawcACkU2oBgXCMzTNGRCFjyRqN64CN1Yu5nJmEEBzsCzZ8DUicK8hIUbnsVOvxtm4ZItuMOTp7Bm0yYg3zKZliwO09uAvRLGuxRrpO67IKGZOJTUknkkgbrYzZooT8stcdcvbGuk/X11byvL7J2YVjMg4nyh5aERZsLIvlhk7n1i5aIETTzpJsJplA0/MAnKBUwEkvgGM9Q0hR0mg/oiBtyiSUUVc0g0iR2OkzZru9qKQwL9MuRaL+3i5vW3PE68aRMAAY0Qxnsuty8mleJ/l9jjVXsEYrxeuiQ71Y03xNh7zNB6POnmwdvXB+fX5u5sDQkKvHA1Sl+J6lEWMaR2uJve1D3/TQAiFYHaN5wEmGRzIpagJCZyskAqdy4ciYvRBNVJXPrdSVLMAKoFha9feGTuzGUd+SpYtycvIgUfsHnIFgpLOjW1IxgBRtsUGahRDIPhdgOKBpNC/oOVoMeOrqqo1ms9/ntaemBYOR3v5eryeuM3NZN8+Ws7I4MRL85rSncZjWAaIp56NBjDPkxoSl7bUAQDjR7ILj9JtJpEFAzvoDbc0wlC+BtIUQDKGcGGim/X2JkC8nJys9MyvFZmJpBBHl8vgDfp8kSpqmCXqjKIkIYoSYsrISChFZliVZ8/v8p0+eSNB6xlBgSke2S7NwRirpGfZsbYs6Q7QACNYmjvIm+R7J3CaCAACQSaklBEBIkg9gJ6QfGz9mDIAoogFIMUJhHZtWBjQEKUqVo6r7TGyojcSCCBBHVqYjKyshyfUzygAgoqQEwjGOoX0+X1qKtbNvKBgM+TxuMZGApjQhs4oCnCE/br3Iocgosqvdd2BAU1WKwQRjACCcSsWaxiIaMwCkU2omFU0iG5CkmHTWLAQQCMfCK2VK5XNqaGMmgBSEEBBFi7iVgDPhG8KxAFDl/FyH2xeSpYSmYQARz/McSwXDcUpv5VJy2ZRiSJtoZtQ6W2RzzMHGUf8P3QlXjOIBHI+XkPwPzNJxzlxKzQSXC4L/+SIAAIQAJoQA2pzOZhRTxgyIBAARhABghSgxLEbEaBARFWIFAgAQDRgecibWaIeciRBMgSFdhltfwEX7Jc+ePnEkjBiCaAI0fA4nIum7cLpWBALI2GumsTz+vSYTliEIEYwBAYg30ZYM2pyOeCtkBIQYgBBEFDlLOYIAQggw0RQc9yNtiDGEaSOQ/FrotE8JxCgOIAYAjAmB8BwUQPKTfN4kBaaxaKdAf6obJQNskncBCMYAIsQIiDciwYg4PaR5SNGEEKLJRE5gMazFQhBIlEBhBSphmagK4iCiAdHIRGqC4xifpGiRKb/PY5MpPjCNoDwtNSe5CjkfdwoQQAiepAlOBEBylmEKACAaBhAjBACcrM0gOYeMeM5iTVtHMv2EJunZJO+UTCo6sQAEnEM7BhNsTgDHqcckmWUKAQEEEBUAghAEZIzSN52xS8Zp0WTaYpOpdCcypZ6gk/b4U+wAz+WegilWPj+VmySt2nlmgz9JCT935p+iUU6FCgL/i+Dzv4lO/w8X+f8bPkYY+r8fmFq8b7stjwAAAABJRU5ErkJggg==";

const BASE_STYLE = `
  .brand{display:flex;align-items:center;justify-content:center;gap:10px;
    padding:14px 0 4px;}
  .brand img{width:44px;height:44px;border-radius:10px;display:block;}
  .brand span{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
    font-weight:700;font-size:13px;color:#1a2b4c;letter-spacing:.02em;}
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f6f9;
    color:#1f2430;margin:0;padding:0;}
  .wrap{max-width:480px;margin:0 auto;padding:20px 16px 60px;}
  .card{background:#fff;border-radius:12px;padding:20px;margin-bottom:14px;
    box-shadow:0 1px 3px rgba(0,0,0,0.08);}
  h1{font-size:20px;margin:0 0 2px;color:#1a2b4c;}
  .updated{font-size:12px;color:#8a94a1;margin-bottom:18px;}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#55606e;
    font-weight:700;margin-bottom:8px;}
  .flag{display:inline-block;background:#fde8e8;color:#a12727;font-weight:700;
    padding:6px 12px;border-radius:6px;font-size:14px;margin-bottom:4px;}
  .row{padding:8px 0;border-bottom:1px solid #eef1f6;}
  .row:last-child{border-bottom:none;}
  .name{font-weight:700;}
  .sub{color:#55606e;font-size:13px;}
  a.tel{color:#1a2b4c;text-decoration:none;font-weight:700;}
  .textblock{white-space:pre-line;font-size:14px;line-height:1.6;}
  .upsell{margin-top:10px;padding:8px 10px;background:#eef1f6;border-radius:6px;
    font-size:12px;color:#1a2b4c;font-weight:600;}
  .btn{display:block;text-align:center;background:#1a2b4c;color:#fff;padding:12px;
    border-radius:8px;text-decoration:none;font-weight:700;margin-top:10px;}
  .empty{color:#8a94a1;font-size:13px;font-style:italic;}
`;

export function renderProfileHtml(profile, { profileUrl }) {
  if (!profile) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/png" href="${FAVICON_DATA_URL}">
    <title>Profile not found</title><style>${BASE_STYLE}</style></head>
    <body><div class="wrap">
    <div class="brand"><img src="${LOGO_DATA_URL}" alt="My Emergency Info logo"><span>MY EMERGENCY INFO</span></div>
    <div class="card"><h1>Profile not found</h1>
    <p class="sub">This emergency-info link doesn't match an active profile.</p>
    </div></div></body></html>`;
  }

  const updated = new Date(profile.updated_at * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  const contactsHtml = renderTieredBlock(profile.emergency_contacts, profile.tier, "emergency_contacts")
    ?? `<p class="empty">No emergency contacts on file.</p>`;

  const doctorsHtml = renderTieredBlock(profile.doctors, profile.tier, "doctors")
    ?? `<p class="empty">No doctors on file.</p>`;

  const medsHtml = renderTieredBlock(profile.medications, profile.tier, "medications")
    ?? `<p class="empty">No medications on file.</p>`;

  const conditionsHtml = profile.conditions?.length
    ? profile.conditions.map((c) => `<span class="flag">${esc(c)}</span>`).join(" ")
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="${FAVICON_DATA_URL}">
  <title>${esc(profile.full_name || "Emergency Info")} — Emergency Info</title>
  <style>${BASE_STYLE}</style></head>
  <body><div class="wrap">
    <div class="brand"><img src="${LOGO_DATA_URL}" alt="My Emergency Info logo"><span>MY EMERGENCY INFO</span></div>
    <div class="card">
      <h1>${esc(profile.full_name || "Emergency Info")}</h1>
      <div class="updated">Last updated ${updated}</div>
      ${conditionsHtml ? `<div>${conditionsHtml}</div>` : ""}
      ${profile.blood_type ? `<div class="sub" style="margin-top:8px;">Blood type: ${esc(profile.blood_type)}</div>` : ""}
      ${profile.allergies ? `<div class="sub">Allergies: ${esc(profile.allergies)}</div>` : ""}
    </div>
    <div class="card">
      <div class="label">Emergency Contacts</div>
      ${contactsHtml}
    </div>
    <div class="card">
      <div class="label">Doctors</div>
      ${doctorsHtml}
    </div>
    <div class="card">
      <div class="label">Medications</div>
      ${medsHtml}
    </div>
    <a class="btn" href="${esc(profileUrl)}/pdf">Download PDF</a>
  </div></body></html>`;
}

export function renderEditFormHtml(
  profile,
  token,
  { saved = false, error = null, newEditUrl = null, tier = null } = {}
) {
  const savedBlock = !saved
    ? ""
    : newEditUrl
    ? `<div class="card">
        <strong>Saved.</strong> Your public page is now up to date.
        <div class="sub" style="margin-top:8px;">Your plan includes unlimited updates. Save or bookmark this link — it's now your active edit link:</div>
        <div style="word-break:break-all;background:#f4f6f9;border:1px solid #cfd6de;border-radius:6px;
          padding:8px 10px;margin-top:6px;font-size:13px;">${esc(newEditUrl)}</div>
      </div>`
    : `<div class="card">
        <strong>Saved.</strong> Your public page is now up to date.
        <div class="sub" style="margin-top:8px;">This edit link has now been used and won't work again — free plan links are single-use.
        Upgrade to Essential or Ultimate to update your info anytime with a link that always stays active.</div>
      </div>`;

  // Once a paid save issues a fresh link, point the form at it so a second
  // edit on the same page load (without reloading first) still works.
  const formAction = newEditUrl || "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="${FAVICON_DATA_URL}">
  <title>Update your emergency info</title>
  <style>${BASE_STYLE}
    input,textarea{width:100%;box-sizing:border-box;padding:9px;margin:4px 0;
      border:1px solid #cfd6de;border-radius:6px;font-size:14px;font-family:inherit;}
    textarea{resize:vertical;min-height:76px;}
    label{font-size:12px;color:#55606e;font-weight:700;}
    .hint{font-size:11px;color:#8a94a1;margin:-2px 0 2px;}
  </style></head>
  <body><div class="wrap">
    <div class="brand"><img src="${LOGO_DATA_URL}" alt="My Emergency Info logo"><span>MY EMERGENCY INFO</span></div>
    <div class="card">
      <h1>Update your emergency info</h1>
      <div class="sub">Changes save immediately. Your public link and QR code never change.</div>
    </div>
    ${savedBlock}
    ${error ? `<div class="card" style="color:#a12727;">${esc(error)}</div>` : ""}
    <form method="POST"${formAction ? ` action="${esc(formAction)}"` : ""} class="card">
      <label>Full name</label>
      <input name="full_name" value="${esc(profile.full_name)}">
      <label>Emergency contacts</label>
      <div class="hint">One per line, e.g. Jane Doe (Sister) — 555-123-4567</div>
      <textarea name="emergency_contacts">${esc(profile.emergency_contacts)}</textarea>
      <label>Doctors</label>
      <div class="hint">One per line, e.g. Dr. Smith, Cardiologist — 555-987-6543</div>
      <textarea name="doctors">${esc(profile.doctors)}</textarea>
      <label>Medications</label>
      <div class="hint">One per line, e.g. Metformin 500mg — twice daily</div>
      <textarea name="medications">${esc(profile.medications)}</textarea>
      <label>Blood type</label>
      <input name="blood_type" value="${esc(profile.blood_type)}">
      <label>Allergies</label>
      <input name="allergies" value="${esc(profile.allergies)}">
      <label>Conditions (comma-separated)</label>
      <input name="conditions" value="${esc((profile.conditions || []).join(", "))}">
      <button class="btn" type="submit" style="border:none;width:100%;">Save changes</button>
    </form>
  </div></body></html>`;
}
