async function chooseAssessor(page,label,name){
 const group=page.getByRole('group',{name:label,exact:true});
 if(!await group.getByRole('button',{name:new RegExp('^(✓ )?'+name+'$')}).count()){
  await group.getByRole('button',{name:'평가자 등록·관리',exact:true}).click();
  const modal=page.getByRole('dialog');await modal.getByLabel('등록할 평가자',{exact:true}).fill(name);
  await modal.getByRole('button',{name:'평가자 등록 저장',exact:true}).click();
  await modal.getByRole('button',{name:'평가자 선택으로',exact:true}).click();
 }
 await group.getByRole('button',{name:new RegExp('^(✓ )?'+name+'$')}).click();
}
module.exports={chooseAssessor};
